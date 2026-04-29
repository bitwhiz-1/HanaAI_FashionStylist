let msgCount = 0;
let isTyping = false;
let sessionId = localStorage.getItem("sessionId");

if (!sessionId) {
  sessionId = "session_" + Date.now();
  localStorage.setItem("sessionId", sessionId);
}
function toggleMobileSidebar() {
  document.querySelector(".sidebar").classList.toggle("open");
}

function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  document.getElementById("btn-dark").classList.toggle("active", t === "dark");
  document.getElementById("btn-light").classList.toggle("active", t === "light");
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}

function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function addTag(text) {
  const input = document.getElementById("chat-input");
  if (input.value && !input.value.endsWith(" ")) input.value += " ";
  input.value += text + " ";
  input.focus();
}

function sendSuggestion(text) {
  document.getElementById("chat-input").value = text;
  sendMessage();
}

function showMessages() {
  document.getElementById("welcome-screen").style.display = "none";
  document.getElementById("messages-list").style.display = "block";
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMessageText(who, text) {
  if (who === "hana" && window.marked) {
    marked.setOptions({ breaks: true, gfm: true });
    return marked.parse(text || "");
  }
  return `<p>${escapeHTML(text || "")}</p>`;
}

function renderProducts(products = []) {
  if (!products.length) return "";

  return `
    <div class="product-grid">
      ${products.map(p => `
        <div class="product-card">
          ${p.thumbnail ? `<img src="${escapeHTML(p.thumbnail)}" alt="${escapeHTML(p.title || "Product")}">` : ""}
          <h4>${escapeHTML(p.title || "Product")}</h4>
          <p><strong>Price:</strong> ${escapeHTML(p.price || "N/A")}</p>
          <p><strong>Store:</strong> ${escapeHTML(p.source || "Unknown")}</p>
          ${p.link ? `<a href="${escapeHTML(p.link)}" target="_blank" rel="noopener noreferrer">View Product</a>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function appendMessage(who, text, extra = {}) {
  showMessages();
  const list = document.getElementById("messages-list");

  if (msgCount === 0) {
    const d = document.createElement("div");
    d.className = "date-divider";
    d.textContent = "Today";
    list.appendChild(d);
  }

  msgCount++;

  const msg = document.createElement("div");
  msg.className = "message" + (who === "user" ? " user" : "");

  const avatar =
    who === "hana"
      ? `<div class="msg-avatar hana">H</div>`
      : `<div class="msg-avatar user-av">U</div>`;

  msg.innerHTML = `
    ${avatar}
    <div class="msg-body">
      <div class="msg-name">${who === "hana" ? "Hana · Stylist" : "You"}</div>
      <div class="msg-bubble">
        ${renderMessageText(who, text)}
        ${renderProducts(extra.products)}
      </div>
    </div>
  `;

  list.appendChild(msg);
  scrollBottom();
}

function showTyping() {
  const list = document.getElementById("messages-list");
  const t = document.createElement("div");
  t.id = "typing-indicator";
  t.className = "message";

  t.innerHTML = `
    <div class="msg-avatar hana">H</div>
    <div class="msg-body">
      <div class="msg-name">Hana · Stylist</div>
      <div class="typing-bubble">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;

  list.appendChild(t);
  scrollBottom();
}

function removeTyping() {
  const t = document.getElementById("typing-indicator");
  if (t) t.remove();
}

function scrollBottom() {
  const s = document.getElementById("main-scroll");
  s.scrollTop = s.scrollHeight;
}
async function sendMessage(){
  if (isTyping) return;
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;
  appendMessage("user", text);
  input.value = "";
  input.style.height = "auto";
  isTyping = true;
  showTyping();
  try{
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        sessionId
      })
    });
    const data = await res.json();
    removeTyping();
    appendMessage("hana", data.reply || "No response", {
      products: data.products || []
    });
    loadSessions();
  }catch (err){
    removeTyping();
    appendMessage("hana", "Server error. Check backend.");
  }
  isTyping = false;
}
async function loadSessions(){
  try{
    const res = await fetch("/sessions");
    const sessions = await res.json();
    const history = document.querySelector(".chat-history");
    history.innerHTML = "";
    sessions.forEach((item) => {
      const div = document.createElement("div");
      div.className = "history-item";
      div.onclick = () => {
        document.querySelectorAll(".history-item").forEach(e => e.classList.remove("active"));
        div.classList.add("active");
        loadSession(item._id);
      };
      div.innerHTML = `
        <div class="history-icon">👗</div>
        <div class="history-meta">
          <div class="history-title">${escapeHTML(item.title || "Style Chat")}</div>
          <div class="history-time">${new Date(item.createdAt).toLocaleDateString()}</div>
        </div>
      `;
      history.appendChild(div);
    });
  } catch (err) {
    console.error("Failed to load sessions:", err);
  }
}
async function loadSession(id) {
  sessionId = id;
  localStorage.setItem("sessionId", sessionId);

  msgCount = 0;
  document.getElementById("messages-list").innerHTML = "";

  const res = await fetch(`/history/${sessionId}`);
  const chats = await res.json();

  chats.forEach((chat) => {
    appendMessage("user", chat.userMessage);
    appendMessage("hana", chat.botReply, {
      products: chat.products || []
    });
  });
}
function newChat(){
  msgCount=0;
  sessionId = "session_" + Date.now();
  localStorage.setItem("sessionId", sessionId);
  document.getElementById("messages-list").innerHTML = "";
  document.getElementById("messages-list").style.display = "none";
  document.getElementById("welcome-screen").style.display = "flex";
  loadSessions();
}
function loadSample(el) {
  document.querySelectorAll(".history-item").forEach(e =>
    e.classList.remove("active")
  );
  el.classList.add("active");
}

/* CANVAS */
const canvas = document.getElementById("fashion-canvas");
const ctx = canvas.getContext("2d");

let W, H, particles = [];

function resize() {
  W = canvas.width = canvas.offsetWidth;
  H = canvas.height = canvas.offsetHeight;
}

class Particle {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = Math.random() * W;
    this.y = Math.random() * H;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = (Math.random() - 0.5) * 0.3;
  }
  update() {
  this.x += this.vx;
  this.y += this.vy;

  if (
    this.x < -10 ||
    this.x > W + 10 ||
    this.y < -10 ||
    this.y > H + 10
  ) {
    this.reset();
  }
}
  draw() {
    ctx.fillStyle = "#c9a96e";
    ctx.fillRect(this.x, this.y, 2, 2);
  }
}

for (let i = 0; i < 60; i++) particles.push(new Particle());

function animate() {
  requestAnimationFrame(animate);
  ctx.clearRect(0, 0, W, H);
  particles.forEach(p => {
    p.update();
    p.draw();
  });
}
window.onload = async () => {
  loadSessions();
  try{
    const res = await fetch(`/history/${sessionId}`);
    const data = await res.json();
    if (data.length > 0){
      showMessages();
      data.forEach(chat =>{
        appendMessage("user", chat.userMessage);
        appendMessage("hana", chat.botReply, {
          products: chat.products || []
        });
      });
    }
  }catch (err){
    console.error("History load error:", err);
  }
};
window.addEventListener("resize", resize);
resize();
animate();