"use strict";

// ========== Growth Record Data ==========
const growthRecords = [
  { id: 1, category: "attendance", title: "到校签到", time: "今天 16:32", desc: "李老师已确认张小明到达中心，体温正常，情绪稳定。", tag: "已到校", tone: "green" },
  { id: 2, category: "homework", title: "语文阅读打卡", time: "今天 18:10 前", desc: "《小英雄雨来》阅读 20 分钟，家长可在沟通页补充孩子在家阅读情况。", tag: "待完成", tone: "yellow" },
  { id: 3, category: "homework", title: "数学口算练习", time: "今天晚辅", desc: "20 道两位数加减法，老师晚辅检查后会同步结果。", tag: "老师跟进", tone: "blue" },
  { id: 4, category: "errors", title: "错题提醒：应用题单位", time: "昨天", desc: "孩子容易漏写单位，建议回家后用生活场景再练 2 题。", tag: "需复习", tone: "red" },
  { id: 5, category: "teacher", title: "老师反馈", time: "今天 17:05", desc: "今天主动帮助同学整理书包，课堂专注度比昨天更好。", tag: "表现好", tone: "green" },
  { id: 6, category: "attendance", title: "本月出勤统计", time: "6月", desc: "本月已出勤 16 天，准时接送 14 天，延时看护 2 次。", tag: "正常", tone: "blue" },
];

// ========== DOM Elements ==========
const pages = document.querySelectorAll(".page");
const tabItems = document.querySelectorAll(".tab-item");
const headerTitle = document.querySelector(".header-title");
const courseList = document.getElementById("courseList");
const courseTabs = document.getElementById("courseTabs");
const bannerTrack = document.getElementById("bannerTrack");
const bannerDots = document.getElementById("bannerDots");
const bookingForm = document.getElementById("bookingForm");
const formNote = document.getElementById("formNote");
const toast = document.getElementById("toast");
const statusTime = document.getElementById("statusTime");

// ========== Tab Switching ==========
const tabTitles = { home: "锐之博托管中心", courses: "成长记录", book: "家校沟通", profile: "个人中心" };

tabItems.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    switchTab(target);
  });
});

function switchTab(target) {
  // Update tab bar
  tabItems.forEach((t) => t.classList.toggle("active", t.dataset.tab === target));
  // Update pages
  pages.forEach((p) => p.classList.toggle("active", p.dataset.page === target));
  // Update header title
  headerTitle.textContent = tabTitles[target] || "锐之博托管中心";
  if (target === "courses") document.querySelector(".page[data-page=courses]").scrollTop = 0;
  if (target === "book") document.querySelector(".page[data-page=book]").scrollTop = 0;
  if (target === "home") document.querySelector(".page[data-page=home]").scrollTop = 0;
}

// "查看全部" link in home -> growth records
document.querySelector(".section-more[data-tab]")?.addEventListener("click", (e) => {
  e.preventDefault();
  switchTab("courses");
});

// ========== Banner Carousel ==========
let bannerIndex = 0;
let bannerTimer = null;
const slideCount = 3;

function goToSlide(index) {
  bannerIndex = (index + slideCount) % slideCount;
  bannerTrack.style.transform = `translateX(-${bannerIndex * 100}%)`;
  bannerDots.querySelectorAll(".dot").forEach((dot, i) => dot.classList.toggle("active", i === bannerIndex));
}

function nextSlide() { goToSlide(bannerIndex + 1); }

function startBanner() { stopBanner(); bannerTimer = setInterval(nextSlide, 3500); }
function stopBanner() { if (bannerTimer) { clearInterval(bannerTimer); bannerTimer = null; } }

bannerTrack.addEventListener("touchstart", stopBanner, { passive: true });
bannerTrack.addEventListener("touchend", startBanner, { passive: true });

goToSlide(0);
startBanner();

// ========== Growth Record Rendering ==========
let activeCategory = "all";

function renderCourses(category) {
  const filtered = category === "all" ? growthRecords : growthRecords.filter((c) => c.category === category);
  if (filtered.length === 0) {
    courseList.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--muted);font-size:14px;">暂无相关记录</div>`;
    return;
  }
  courseList.innerHTML = filtered
    .map(
      (c) => `
    <div class="course-card growth-card" data-id="${c.id}">
      <div class="course-card-body">
        <div class="growth-card-head"><h4>${c.title}</h4><span class="growth-tag ${c.tone}">${c.tag}</span></div>
        <div class="course-time">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${c.time}
        </div>
        <p class="course-desc">${c.desc}</p>
        <div class="course-footer">
          <span class="course-price">${categoryLabel(c.category)}</span>
          <button class="course-book-btn" data-topic="${c.title}">联系老师</button>
        </div>
      </div>
    </div>`
    )
    .join("");

  courseList.querySelectorAll(".course-book-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const textarea = document.getElementById("message");
      textarea.value = `想和老师沟通一下「${btn.dataset.topic}」的情况。`;
      switchTab("book");
      textarea.focus();
      showToast("已打开家校沟通");
    });
  });
}

function categoryLabel(category) {
  return { attendance: "出勤", homework: "作业", errors: "错题", teacher: "反馈" }[category] || "记录";
}

renderCourses("all");

// Course category tabs
courseTabs.querySelectorAll(".course-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    courseTabs.querySelectorAll(".course-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    activeCategory = tab.dataset.category;
    renderCourses(activeCategory);
  });
});

// ========== Parent-Teacher Messaging ==========
bookingForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!bookingForm.checkValidity()) {
    bookingForm.reportValidity();
    return;
  }
  const messageInput = document.getElementById("message");
  const message = messageInput.value.trim();
  const messageList = document.getElementById("messageList");
  messageList.insertAdjacentHTML("beforeend", `<div class="message-row parent"><div class="message-bubble">${escapeHtml(message)}</div></div>`);
  formNote.textContent = "消息已发送给李老师。";
  formNote.style.color = "var(--green)";
  messageInput.value = "";
  messageList.scrollTop = messageList.scrollHeight;
  showToast("消息发送成功");
});

document.querySelectorAll(".quick-replies button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("message").value = btn.dataset.reply;
    document.getElementById("message").focus();
  });
});

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

// ========== Quick Actions ==========
document.querySelectorAll(".quick-item").forEach((item) => {
  item.addEventListener("click", () => {
    const action = item.dataset.action;
    if (action === "book") switchTab("book");
    else if (action === "consult") switchTab("book");
    else if (action === "growth") switchTab("courses");
    else if (action === "contact") showToast("地址：请替换为中心实际地址");
  });
});

// ========== Profile Actions ==========
document.getElementById("loginBtn")?.addEventListener("click", () => {
  showToast("登录功能开发中");
});

document.querySelectorAll(".menu-item").forEach((item) => {
  item.addEventListener("click", () => {
    const action = item.dataset.action;
    const msgs = {
      children: "孩子管理功能即将上线",
      bookings: "预约记录功能即将上线",
      growth: "正在打开成长记录",
      settings: "设置功能即将上线",
    };
    if (action === "growth") switchTab("courses");
    showToast(msgs[action] || "功能开发中");
  });
});

// ========== Toast ==========
let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

// ========== Status Bar Time ==========
function updateTime() {
  const now = new Date();
  statusTime.textContent = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");
}
updateTime();
setInterval(updateTime, 30000);

// ========== Init ==========
