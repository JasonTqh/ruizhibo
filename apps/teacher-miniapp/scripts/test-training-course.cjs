const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

const fixture = {
  assignmentStatus: "in_progress",
  course: {
    status: "available",
    snapshot: {
      course: { name: "校区文化", category: "校区文化", minimumMinutes: 5 },
      chapters: [
        {
          key: "intro",
          title: "认识校区",
          contentHtml: "<p>课程正文</p>",
          media: [],
        },
      ],
      quiz: null,
    },
    attempt: { chapterProgress: [], accumulatedSeconds: 0 },
  },
};

function mount({ id = "course-1", fail = false } = {}) {
  const slots = [];
  const calls = [];
  let cursor = 0;
  let onLoad, onShow;
  let failing = fail;
  const react = {
    createElement: (type, props, ...children) => ({
      type,
      props: props || {},
      children: children.flat(Infinity).filter((x) => x != null && x !== false),
    }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (value) => {
          slots[index] =
            typeof value === "function" ? value(slots[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect() {},
  };
  const taro = {
    useRouter: () => ({ params: {} }), // ID arrives through onLoad after the first render.
    useLoad: (callback) => {
      onLoad = callback;
    },
    useDidShow: (callback) => {
      onShow = callback;
    },
    useDidHide() {},
    useUnload() {},
    usePullDownRefresh() {},
    stopPullDownRefresh() {},
    getCurrentInstance() {
      throw Error("Do not read the global page instance during render");
    },
  };
  const request = async (path, options) => {
    calls.push({ path, options });
    if (failing) throw new Error("网络请求超时");
    if (path.endsWith("/study/start")) return { id: "session-1" };
    return fixture;
  };
  const exports = {};
  const code = ts.transpileModule(
    readFileSync(
      join(__dirname, "../src/pages/training-course/index.tsx"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    },
  ).outputText;
  vm.runInNewContext(code, {
    exports,
    Date,
    Set,
    Error,
    require(path) {
      if (path === "react") return react;
      if (path === "@tarojs/taro") return taro;
      if (path === "@tarojs/components")
        return Object.fromEntries(
          ["Button", "Image", "RichText", "Text", "Video", "View"].map(
            (name) => [name, name],
          ),
        );
      if (path === "../../api") return { teacherRequest: request };
      if (path === "../../config") return { resolveApiAssetUrl: (url) => url };
      if (path.endsWith(".scss")) return {};
      throw Error(path);
    },
  });
  const render = () => {
    cursor = 0;
    return exports.default();
  };
  render();
  onLoad(id ? { id } : {});
  onShow();
  return {
    render,
    calls,
    recover: () => {
      failing = false;
    },
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
const nodes = (node) =>
  typeof node === "object"
    ? [node, ...(node.children || []).flatMap(nodes)]
    : [];

test("late route ID loads and renders campus culture once, then starts study", async () => {
  const page = mount();
  await settle();
  const rendered = JSON.stringify(page.render());
  assert.ok(rendered.includes("校区文化"));
  assert.ok(rendered.includes("可学习"));
  assert.ok(!rendered.includes("正在加载课程"));
  assert.equal(
    page.calls.filter(
      (call) => call.path === "/teacher/training/courses/course-1",
    ).length,
    1,
  );
  assert.ok(
    page.calls.some((call) => call.path.endsWith("/course-1/study/start")),
  );
  assert.equal(page.calls[0].options.timeout, 15000);
});

test("missing ID exits loading with an actionable error", async () => {
  const page = mount({ id: "" });
  await settle();
  const rendered = JSON.stringify(page.render());
  assert.ok(rendered.includes("缺少课程信息"));
  assert.ok(!rendered.includes("正在加载课程"));
  assert.equal(page.calls.length, 0);
});

test("request failure displays retry and successfully recovers", async () => {
  const page = mount({ fail: true });
  await settle();
  const tree = page.render();
  assert.ok(JSON.stringify(tree).includes("网络请求超时"));
  const retry = nodes(tree).find((node) => node.type === "Button");
  assert.ok(retry);
  page.recover();
  retry.props.onClick();
  await settle();
  const rendered = JSON.stringify(page.render());
  assert.ok(rendered.includes("校区文化"));
  assert.ok(!rendered.includes("网络请求超时"));
});
