import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  useState,
} from "react";
import type { ReactNode, ReactElement } from "react";
import { Button, Form } from "antd";

// Keep folded Form.Items mounted so their values remain part of server queries.
export default function QueryFields({
  children,
  primary,
  onReset,
}: {
  children: ReactNode;
  primary: string[];
  onReset?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const form = Form.useFormInstance();
  const values = Form.useWatch([], form) || {};
  function flatten(nodes: ReactNode): ReactElement<any>[] {
    return Children.toArray(nodes).flatMap((node) =>
      isValidElement(node)
        ? node.type === Fragment
          ? flatten((node.props as any).children)
          : [node]
        : [],
    );
  }
  const items = flatten(children);
  const named = items.filter((item) => item.props.name);
  const keys = primary
    .filter((key) => named.some((item) => item.props.name === key))
    .slice(0, 3);
  for (const item of named)
    if (keys.length < 3 && !keys.includes(item.props.name))
      keys.push(item.props.name);
  const extras = named.filter((item) => !keys.includes(item.props.name));
  const count = extras.filter(
    (item) => values[item.props.name] != null && values[item.props.name] !== "",
  ).length;
  return (
    <>
      {named
        .filter((item) => keys.includes(item.props.name))
        .map((item) => cloneElement(item, { key: item.props.name }))}
      {extras.map((item) =>
        cloneElement(item, { key: item.props.name, hidden: !expanded }),
      )}
      {items.filter((item) => !item.props.name)}
      {onReset ? (
        <Form.Item>
          <Button
            onClick={() => {
              form.resetFields();
              onReset();
            }}
          >
            重置
          </Button>
        </Form.Item>
      ) : null}
      {extras.length ? (
        <Form.Item>
          <Button type="link" onClick={() => setExpanded(!expanded)}>
            {expanded
              ? "收起筛选"
              : `更多筛选${count ? `（已用 ${count} 项）` : ""}`}
          </Button>
        </Form.Item>
      ) : null}
    </>
  );
}
