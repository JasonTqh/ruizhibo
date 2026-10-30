import { useState } from "react";
import { Button, Form, Input, Space, Table, Typography } from "antd";
import type { TableProps } from "antd";

export interface QueryField<T> {
  key: string;
  label: string;
  value: (row: T) => unknown;
}
export function matchesQuery<T>(
  row: T,
  fields: QueryField<T>[],
  values: Record<string, string>,
) {
  return fields.every((field) => {
    const query = (values[field.key] || "").trim().toLocaleLowerCase();
    return (
      !query ||
      String(field.value(row) ?? "")
        .toLocaleLowerCase()
        .includes(query)
    );
  });
}

export function QueryBar<T>({
  fields,
  onQuery,
}: {
  fields: QueryField<T>[];
  onQuery: (values: Record<string, string>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [form] = Form.useForm();
  const extraCount = fields
    .slice(3)
    .filter((field) => applied[field.key]?.trim()).length;
  return (
    <Form
      form={form}
      layout="inline"
      className="module-query"
      onFinish={(values) => {
        setApplied(values);
        onQuery(values);
      }}
    >
      {fields.map((field, index) => (
        <Form.Item
          key={field.key}
          name={field.key}
          label={field.label}
          hidden={index >= 3 && !expanded}
        >
          <Input
            allowClear
            placeholder={`搜索${field.label}`}
          />
        </Form.Item>
      ))}
      <Form.Item>
        <Space wrap>
          <Button type="primary" htmlType="submit">
            查询
          </Button>
          <Button
            onClick={() => {
              form.resetFields();
              setApplied({});
              onQuery({});
            }}
          >
            重置
          </Button>
          {fields.length > 3 ? (
            <Button type="link" onClick={() => setExpanded(!expanded)}>
              {expanded
                ? "收起筛选"
                : `更多筛选${extraCount ? `（已用 ${extraCount} 项）` : ""}`}
            </Button>
          ) : null}
        </Space>
      </Form.Item>
    </Form>
  );
}

export default function QueryTable<T extends object>({
  queryFields,
  dataSource = [],
  pagination,
  ...props
}: TableProps<T> & { queryFields: QueryField<T>[] }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const filtered = dataSource.filter((row) =>
    matchesQuery(row, queryFields, values),
  );
  return (
    <div>
      <QueryBar
        fields={queryFields}
        onQuery={(next) => {
          setValues(next);
          setPage(1);
        }}
      />
      <Typography.Paragraph type="secondary">
        共 {filtered.length} 条符合条件的记录
      </Typography.Paragraph>
      <Table<T>
        {...props}
        locale={{
          ...props.locale,
          ...(Object.values(values).some((value) => value?.trim())
            ? { emptyText: "没有符合当前查询条件的记录" }
            : {}),
        }}
        dataSource={filtered}
        pagination={
          pagination === false
            ? false
            : {
                ...pagination,
                current: page,
                onChange: (next, size) => {
                  setPage(next);
                  if (pagination && pagination.onChange)
                    pagination.onChange(next, size);
                },
              }
        }
      />
    </div>
  );
}
