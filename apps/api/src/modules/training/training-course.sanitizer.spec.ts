import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeTrainingHtml } from "./training-course.service";

test("training HTML keeps learning markup and removes executable content", () => {
  const result = sanitizeTrainingHtml(
    '<h2 onclick="alert(1)">标题</h2><script>alert(1)</script><img src="https://outside.example/a.png"><p>正文<strong>重点</strong></p>',
  );
  assert.equal(
    result,
    "<h2>标题</h2><p>正文<strong>重点</strong></p>",
  );
});

test("training HTML only keeps safe link protocols and table spans", () => {
  const result = sanitizeTrainingHtml(
    '<a href="javascript:alert(1)" target="_blank">坏链接</a><a href="https://example.com/a?q=1&x=2">好链接</a><table><tr><td colspan="2" style="color:red">内容</td></tr></table>',
  );
  assert.equal(
    result,
    '<a>坏链接</a><a href="https://example.com/a?q=1&amp;x=2" rel="noopener noreferrer">好链接</a><table><tr><td colspan="2">内容</td></tr></table>',
  );
});
