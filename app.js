const $ = (selector) => document.querySelector(selector);
const ACCOUNTS_KEY = "wordbook.accounts.v1";
const SESSION_KEY = "wordbook.session.v1";
const wordsKey = (username) => `wordbook.words.v1.${username}`;
const getAccounts = () => JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
const setAccounts = (accounts) => localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
const message = (target, text) => { $(target).textContent = text; };

function bytesToBase64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function base64ToBytes(value) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
async function passwordHash(password, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt:base64ToBytes(salt), iterations:100000, hash:"SHA-256" }, material, 256);
  return bytesToBase64(new Uint8Array(bits));
}

function initialiseLogin() {
  const form = $("#auth-form");
  let registering = false;
  if (sessionStorage.getItem(SESSION_KEY)) window.location.replace("wordbook.html");
  const updateMode = () => {
    $("#auth-submit").textContent = registering ? "创建账号" : "登录";
    $("#auth-switch").textContent = registering ? "已有账号？登录" : "没有账号？注册";
    $("#password").autocomplete = registering ? "new-password" : "current-password";
    message("#auth-message", registering ? "用户名至少 3 个字符，密码至少 6 位。" : "");
  };
  $("#auth-switch").addEventListener("click", () => { registering = !registering; updateMode(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = $("#username").value.trim(), password = $("#password").value;
    const accounts = getAccounts();
    const existing = accounts.find(item => item.username.toLocaleLowerCase() === username.toLocaleLowerCase());
    if (registering) {
      if (existing) return message("#auth-message", "该用户名已被使用，请直接登录或换一个用户名。");
      const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
      accounts.push({ username, salt, passwordHash:await passwordHash(password, salt) });
      setAccounts(accounts); sessionStorage.setItem(SESSION_KEY, username);
    } else {
      if (!existing || (await passwordHash(password, existing.salt)) !== existing.passwordHash) return message("#auth-message", "用户名或密码不正确。");
      sessionStorage.setItem(SESSION_KEY, existing.username);
    }
    window.location.assign("wordbook.html");
  });
  updateMode();
}

function initialiseWordbook() {
  const currentUser = sessionStorage.getItem(SESSION_KEY);
  if (!currentUser || !getAccounts().some(account => account.username === currentUser)) { window.location.replace("index.html"); return; }
  let entries = JSON.parse(localStorage.getItem(wordsKey(currentUser)) || "[]");
  const normalize = (word) => word.trim().toLocaleLowerCase();
  const letterOf = (word) => /^[a-z]/i.test(word) ? word[0].toUpperCase() : "#";
  const saveWords = () => localStorage.setItem(wordsKey(currentUser), JSON.stringify(entries));
  $("#user-name").textContent = `你好，${currentUser}`;
  $("#translate-button").addEventListener("click", async () => {
    const word = $("#word").value.trim();
    if (!word) return message("#word-message", "请先输入英文单词。");
    const button = $("#translate-button");
    button.disabled = true; button.textContent = "生成中…"; message("#word-message", "");
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh-CN`;
      const response = await fetch(url);
      const data = await response.json();
      const candidates = [
        data?.responseData?.translatedText,
        ...(data?.matches || []).map((match) => match.translation),
      ].map((item) => item?.trim()).filter(Boolean);
      const scoreTranslation = (item) => {
        const chineseCount = (item.match(/[\u3400-\u9fff]/g) || []).length;
        const latinCount = (item.match(/[a-z]/gi) || []).length;
        const digitCount = (item.match(/\d/g) || []).length;
        return chineseCount * 10 - latinCount * 3 - digitCount * 5;
      };
      const translation = candidates
        .filter((item) => /[\u3400-\u9fff]/.test(item))
        .sort((a, b) => scoreTranslation(b) - scoreTranslation(a))[0];
      if (!response.ok || data?.responseStatus !== 200 || !translation) {
        throw new Error("翻译服务没有返回有效中文释义");
      }
      $("#meaning").value = translation;
      message("#word-message", "已生成中文意思，可按需要修改后再添加。");
    } catch (error) {
      message("#word-message", "自动生成失败，请稍后重试或手动填写。");
    } finally {
      button.disabled = false; button.textContent = "自动生成中文意思";
    }
  });
  function render() {
    const query = $("#search").value.trim().toLocaleLowerCase();
    const visible = entries.filter(({ word, meaning }) => !query || word.toLocaleLowerCase().includes(query) || meaning.toLocaleLowerCase().includes(query));
    $("#word-count").textContent = `${visible.length} 个单词`;
    const list = $("#word-list"); list.replaceChildren();
    if (!visible.length) { list.innerHTML = `<p class="empty">${query ? "没有找到匹配的单词" : "还没有单词，先添加第一个吧。"}</p>`; return; }
    const groups = new Map();
    visible.forEach(item => { const letter = letterOf(item.word); groups.set(letter, [...(groups.get(letter) || []), item]); });
    [...groups.keys()].sort().forEach(letter => {
      const group = $("#letter-group-template").content.cloneNode(true); group.querySelector("h3").textContent = letter;
      groups.get(letter).sort((a, b) => a.word.localeCompare(b.word, "en", { sensitivity:"base" })).forEach(({ word, meaning }) => {
        const item = document.createElement("li"); item.className = "word-item";
        const english = document.createElement("strong"); english.textContent = word;
        const chinese = document.createElement("span"); chinese.textContent = meaning;
        item.append(english, chinese); group.querySelector("ul").append(item);
      }); list.append(group);
    });
  }
  $("#word-form").addEventListener("submit", (event) => {
    event.preventDefault(); const word = $("#word").value.trim(), meaning = $("#meaning").value.trim();
    if (entries.some(item => normalize(item.word) === normalize(word))) return message("#word-message", "这个英文单词已在词库中。");
    entries.push({ word, meaning }); saveWords(); event.currentTarget.reset(); message("#word-message", "已添加。"); render();
  });
  $("#search").addEventListener("input", render);
  $("#sign-out").addEventListener("click", () => { sessionStorage.removeItem(SESSION_KEY); window.location.assign("index.html"); });
  render();
}

if (document.body.dataset.page === "login") initialiseLogin();
if (document.body.dataset.page === "wordbook") initialiseWordbook();
