import { useEffect, useRef } from "react";
import { Button, Input, Space } from "antd";

function cleanHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,svg,math,form,input,button").forEach(n => n.remove());
  const allowed = new Set(["P","DIV","BR","B","STRONG","I","EM","U","UL","OL","LI","H2","H3","BLOCKQUOTE","IMG","A","TABLE","THEAD","TBODY","TR","TD","TH","SPAN","HR"]);
  Array.from(doc.body.querySelectorAll("*")).reverse().forEach(el => {
    const url = el.getAttribute(el.tagName === "IMG" ? "src" : "href");
    Array.from(el.attributes).forEach(a => el.removeAttribute(a.name));
    if (url && /^(https?:\/\/|\/(?!\/))/.test(url) && ["IMG", "A"].includes(el.tagName)) el.setAttribute(el.tagName === "IMG" ? "src" : "href", url);
    if (!allowed.has(el.tagName)) el.replaceWith(...Array.from(el.childNodes));
  });
  return doc.body.innerHTML;
}

export function CourseBodyEditor({ value = "", onChange, disabled }: { value?: string; onChange?: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && document.activeElement !== ref.current) ref.current.innerHTML = cleanHtml(value); }, [value]);
  const format = (command: string, arg?: string) => { ref.current?.focus(); document.execCommand(command, false, arg); onChange?.(cleanHtml(ref.current?.innerHTML || "")); };
  return <div className="course-rich-editor"><Space wrap className="course-rich-toolbar"><Button disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => format("bold")}>加粗</Button><Button disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => format("formatBlock", "h2")}>小标题</Button><Button disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => format("formatBlock", "p")}>正文</Button><Button disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => format("insertUnorderedList")}>项目列表</Button></Space><div ref={ref} role="textbox" aria-label="章节正文" aria-multiline contentEditable={!disabled} suppressContentEditableWarning className="course-rich-content" onInput={() => onChange?.(cleanHtml(ref.current?.innerHTML || ""))} onPaste={e => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); onChange?.(cleanHtml(ref.current?.innerHTML || "")); }} /></div>;
}

export function CourseOptionsEditor({ value = "", onChange, disabled }: { value?: string; onChange?: (v: string) => void; disabled?: boolean }) {
  const rows = value ? value.split("\n").filter(Boolean).map(line => { const at = line.indexOf("|"); return { key: at < 0 ? line : line.slice(0, at), text: at < 0 ? "" : line.slice(at + 1) }; }) : [];
  const save = (next: typeof rows) => onChange?.(next.map(r => `${r.key}|${r.text}`).join("\n"));
  return <Space direction="vertical" style={{ width: "100%" }}>{rows.map((r, index) => <Space.Compact key={index} style={{ width: "100%" }}><Input aria-label={`选项${index + 1}标识`} value={r.key} style={{ width: 80 }} disabled={disabled} onChange={e => save(rows.map((x, i) => i === index ? { ...x, key: e.target.value.replace(/[|,\s]/g, "") } : x))} /><Input aria-label={`选项${index + 1}内容`} value={r.text} placeholder="填写选项内容" disabled={disabled} onChange={e => save(rows.map((x, i) => i === index ? { ...x, text: e.target.value.replace(/[\n|]/g, " ") } : x))} /><Button disabled={disabled} danger onClick={() => save(rows.filter((_, i) => i !== index))}>移除</Button></Space.Compact>)}<Button disabled={disabled} onClick={() => { const key = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find(k => !rows.some(r => r.key === k)); if (key) save([...rows, { key, text: "" }]); }}>添加选项</Button></Space>;
}
