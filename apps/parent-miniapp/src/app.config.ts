export default defineAppConfig({
  pages: [
    "pages/home/index",
    "pages/homework/index",
    "pages/growth/index",
    "pages/messages/index",
    "pages/profile/index",
  ],
  window: {
    navigationBarTitleText: "锐之博家长端",
    navigationBarBackgroundColor: "#ffffff",
    navigationBarTextStyle: "black",
    backgroundColor: "#f5f0eb",
  },
  tabBar: {
    color: "#bfbab0",
    selectedColor: "#2f8064",
    backgroundColor: "#ffffff",
    list: [
      { pagePath: "pages/home/index", text: "首页" },
      { pagePath: "pages/growth/index", text: "成长" },
      { pagePath: "pages/messages/index", text: "沟通" },
      { pagePath: "pages/profile/index", text: "我的" },
    ],
  },
});
