export default defineAppConfig({
  pages: [
    "pages/home/index",
    "pages/lesson/index",
    "pages/research/index",
    "pages/teaching/index",
    "pages/workflow/index",
  ],
  window: {
    navigationBarTitleText: "锐之博教师端",
    navigationBarBackgroundColor: "#ffffff",
    navigationBarTextStyle: "black",
    backgroundColor: "#f5f0eb",
  },
  tabBar: {
    color: "#bfbab0",
    selectedColor: "#2f8064",
    backgroundColor: "#ffffff",
    list: [
      { pagePath: "pages/home/index", text: "工作台" },
      { pagePath: "pages/lesson/index", text: "备课" },
      { pagePath: "pages/research/index", text: "教研" },
      { pagePath: "pages/teaching/index", text: "教学" },
      { pagePath: "pages/workflow/index", text: "流程" },
    ],
  },
});
