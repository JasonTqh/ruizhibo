import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

interface Summary {
  id: string;
  name: string;
}

interface ClassSummary extends Summary {
  campusId?: string;
  campus?: Summary;
}

interface StudentSummary extends Summary {
  classId: string;
}

interface PageResult {
  items: BusinessRecord[];
  total: number;
  page: number;
  pageSize: number;
}

type BusinessRecord = Record<string, any> & { id: string };
type BusinessKind =
  | "homework"
  | "teaching"
  | "growth"
  | "attendance"
  | "pickup"
  | "workflow"
  | "lesson"
  | "research";

interface FilterValues {
  campusId?: string;
  classId?: string;
  teacherId?: string;
  studentId?: string;
  status?: string;
  type?: string;
  from?: string;
  to?: string;
  quickFilter?: string;
}

const businessKinds: Array<{
  key: BusinessKind;
  label: string;
  endpoint: string;
}> = [
  { key: "homework", label: "作业", endpoint: "/admin/business/homework" },
  {
    key: "teaching",
    label: "教学记录",
    endpoint: "/admin/business/teaching-records",
  },
  {
    key: "growth",
    label: "成长反馈",
    endpoint: "/admin/business/growth-records",
  },
  { key: "attendance", label: "考勤", endpoint: "/admin/business/attendance" },
  {
    key: "pickup",
    label: "接送记录",
    endpoint: "/admin/business/pickup-records",
  },
  { key: "workflow", label: "一日流程", endpoint: "/admin/business/workflows" },
  { key: "lesson", label: "教案", endpoint: "/admin/business/lesson-plans" },
  {
    key: "research",
    label: "教研活动",
    endpoint: "/admin/business/research-activities",
  },
];

const statusOptions: Partial<Record<BusinessKind, string[]>> = {
  homework: ["pending", "submitted", "reviewed", "overdue"],
  workflow: ["active", "completed"],
  lesson: ["draft", "published", "archived"],
  research: ["draft", "open", "completed", "cancelled"],
  pickup: ["normal", "temporary_authorization", "exception"],
};

const typeOptions: Partial<Record<BusinessKind, string[]>> = {
  growth: ["attendance", "homework", "workflow", "teacher_feedback", "notice"],
  attendance: ["arrive", "leave", "late", "absence"],
  pickup: ["picked_up_from_school", "arrived_at_center", "left_center"],
  research: ["discussion", "observation", "training"],
};

const statusLabels: Record<string, string> = {
  active: "进行中",
  completed: "已完成",
  pending: "待提交",
  submitted: "已提交",
  reviewed: "已批阅",
  overdue: "已逾期",
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
  open: "报名中",
  cancelled: "已取消",
  normal: "正常交接",
  temporary_authorization: "临时授权",
  exception: "异常接送",
  missing_arrival: "今日未到店",
  missing_leave: "今日未离店",
};

const typeLabels: Record<string, string> = {
  attendance: "考勤",
  homework: "作业",
  workflow: "流程",
  teacher_feedback: "教师反馈",
  notice: "通知",
  arrive: "到校",
  leave: "离校",
  late: "迟到",
  absence: "缺勤",
  picked_up_from_school: "学校接到",
  arrived_at_center: "安全到店",
  left_center: "离店交接",
  discussion: "研讨",
  observation: "观摩",
  training: "培训",
};

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN") : "-";
}

function recordTitle(kind: BusinessKind, record: BusinessRecord) {
  if (kind === "pickup") {
    return record.type
      ? `${record.student?.name ?? "学生"} · ${typeLabels[record.type] ?? record.type}`
      : `${record.student?.name ?? "学生"} · ${statusLabels[record.status] ?? record.status}`;
  }
  if (kind === "lesson") return record.theme;
  if (kind === "teaching") return record.course;
  if (kind === "workflow") return record.template?.name;
  return record.title ?? record.name ?? "未命名记录";
}

function recordTime(kind: BusinessKind, record: BusinessRecord) {
  if (kind === "lesson") return record.lessonDate;
  if (kind === "teaching" || kind === "workflow") return record.date;
  if (kind === "growth" || kind === "attendance") return record.happenedAt;
  if (kind === "pickup") return record.happenedAt;
  if (kind === "research") return record.startAt;
  return record.createdAt;
}

function recordScope(record: BusinessRecord) {
  if (record.student) {
    return `${record.student.name} / ${record.class?.name ?? record.student.class?.name ?? "未分班"}`;
  }
  return record.class?.name ?? record.campus?.name ?? "-";
}

function recordOwner(record: BusinessRecord) {
  return record.teacher?.name ?? record.organizer?.name ?? "-";
}

function recordStatus(kind: BusinessKind, record: BusinessRecord) {
  if (kind === "pickup") {
    if (record.isException)
      return `⚠ ${statusLabels[record.status] ?? record.status}`;
    return statusLabels[record.status] ?? record.status ?? "-";
  }
  if (kind === "growth")
    return record.visibleToParent ? "家长可见" : "仅内部可见";
  if (kind === "attendance") return typeLabels[record.type] ?? record.type;
  if (kind === "teaching") return "已记录";
  if (kind === "homework") {
    const submitted = record.submissions?.filter(
      (item: BusinessRecord) => item.status !== "pending",
    ).length;
    return `${submitted ?? 0}/${record.submissions?.length ?? 0} 已提交`;
  }
  if (kind === "workflow") {
    const checked = record.steps?.filter(
      (item: BusinessRecord) => item.checked,
    ).length;
    return `${checked ?? 0}/${record.steps?.length ?? 0} 已完成`;
  }
  return statusLabels[record.status] ?? record.status ?? "-";
}

export function BusinessPanel({
  request,
  classes,
  teachers,
  students,
}: {
  request: Request;
  classes: ClassSummary[];
  teachers: Summary[];
  students: StudentSummary[];
}) {
  const [kind, setKind] = useState<BusinessKind>("homework");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [result, setResult] = useState<PageResult>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<BusinessRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [form] = Form.useForm<FilterValues>();

  const config = businessKinds.find((item) => item.key === kind)!;
  const visibleStudents = useMemo(() => {
    if (!filters.classId) return students;
    return students.filter((student) => student.classId === filters.classId);
  }, [filters.classId, students]);
  const campuses = useMemo(() => {
    const values = new Map<string, string>();
    classes.forEach((item) => {
      if (item.campusId)
        values.set(item.campusId, item.campus?.name ?? item.campusId);
    });
    return Array.from(values, ([value, label]) => ({ value, label }));
  }, [classes]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    setLoading(true);
    setError("");
    request<PageResult>(`${config.endpoint}?${params.toString()}`)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((nextError: Error) => {
        if (active) setError(nextError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [config.endpoint, filters, page, pageSize, refreshKey]);

  async function updateStatus(record: BusinessRecord, status: string) {
    const resource = kind === "lesson" ? "lesson-plans" : "research-activities";
    try {
      setError("");
      await request(`/admin/business/${resource}/${record.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setRefreshKey((value) => value + 1);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "状态更新失败");
    }
  }

  const columns = [
    {
      title: "记录",
      key: "title",
      render: (_: unknown, record: BusinessRecord) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{recordTitle(kind, record)}</Typography.Text>
          <Typography.Text type="secondary">
            {typeLabels[record.type] ?? record.subject ?? ""}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "班级 / 学生",
      key: "scope",
      render: (_: unknown, record: BusinessRecord) => recordScope(record),
    },
    {
      title: "教师",
      key: "owner",
      render: (_: unknown, record: BusinessRecord) => recordOwner(record),
    },
    {
      title: "状态",
      key: "status",
      render: (_: unknown, record: BusinessRecord) => (
        <Tag
          color={
            record.status === "cancelled" || record.isException
              ? "red"
              : "green"
          }
        >
          {recordStatus(kind, record)}
        </Tag>
      ),
    },
    {
      title: "时间",
      key: "time",
      render: (_: unknown, record: BusinessRecord) =>
        formatDate(recordTime(kind, record)),
    },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, record: BusinessRecord) => (
        <Space>
          <Button size="small" onClick={() => setSelected(record)}>
            详情
          </Button>
          {kind === "lesson" || kind === "research" ? (
            <Select
              size="small"
              value={record.status}
              style={{ width: 100 }}
              options={statusOptions[kind]?.map((value) => ({
                value,
                label: statusLabels[value] ?? value,
              }))}
              onChange={(value) => updateStatus(record, value)}
            />
          ) : null}
        </Space>
      ),
    },
  ];

  const showStudent = !["teaching", "workflow", "lesson", "research"].includes(
    kind,
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card>
        <Typography.Title level={4}>业务查询</Typography.Title>
        <Typography.Paragraph type="secondary">
          按班级、教师、学生和日期定位业务记录；教案与教研活动可在结果中调整状态，所有变更均进入审计日志。
        </Typography.Paragraph>
        <Tabs
          activeKey={kind}
          items={businessKinds.map(({ key, label }) => ({ key, label }))}
          onChange={(key) => {
            setKind(key as BusinessKind);
            setPage(1);
            setFilters({});
            form.resetFields();
          }}
        />
        <Form
          form={form}
          layout="inline"
          onFinish={(values) => {
            setFilters(values);
            setPage(1);
          }}
        >
          <Form.Item name="classId" label="班级">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 150 }}
              options={classes.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
          </Form.Item>
          {kind === "pickup" ? (
            <Form.Item name="campusId" label="校区">
              <Select allowClear style={{ width: 160 }} options={campuses} />
            </Form.Item>
          ) : null}
          <Form.Item name="teacherId" label="教师">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 150 }}
              options={teachers.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
          </Form.Item>
          {showStudent ? (
            <Form.Item name="studentId" label="学生">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: 150 }}
                options={visibleStudents.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            </Form.Item>
          ) : null}
          {statusOptions[kind] ? (
            <Form.Item name="status" label="状态">
              <Select
                allowClear
                style={{ width: 130 }}
                options={statusOptions[kind]?.map((value) => ({
                  value,
                  label: statusLabels[value] ?? value,
                }))}
              />
            </Form.Item>
          ) : null}
          {typeOptions[kind] ? (
            <Form.Item name="type" label="类型">
              <Select
                allowClear
                style={{ width: 130 }}
                options={typeOptions[kind]?.map((value) => ({
                  value,
                  label: typeLabels[value] ?? value,
                }))}
              />
            </Form.Item>
          ) : null}
          {kind === "pickup" ? (
            <Form.Item name="quickFilter" label="快捷筛选">
              <Select
                allowClear
                style={{ width: 170 }}
                options={[
                  { value: "missing_arrival_today", label: "今日未到店" },
                  { value: "missing_leave_today", label: "今日未离店" },
                  { value: "exception", label: "异常接送" },
                ]}
              />
            </Form.Item>
          ) : null}
          <Form.Item name="from" label="开始">
            <Input type="date" style={{ width: 145 }} />
          </Form.Item>
          <Form.Item name="to" label="结束">
            <Input type="date" style={{ width: 145 }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button
                onClick={() => {
                  form.resetFields();
                  setFilters({});
                  setPage(1);
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      {error ? (
        <Alert type="error" showIcon message="查询失败" description={error} />
      ) : null}
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={result.items}
          locale={{ emptyText: "当前条件下暂无业务记录" }}
          pagination={{
            current: page,
            pageSize,
            total: result.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize === pageSize ? nextPage : 1);
              setPageSize(nextPageSize);
            },
          }}
        />
      </Card>
      <Drawer
        title="业务记录详情"
        width={560}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="记录名称">
              {recordTitle(kind, selected)}
            </Descriptions.Item>
            <Descriptions.Item label="班级 / 学生">
              {recordScope(selected)}
            </Descriptions.Item>
            <Descriptions.Item label="教师">
              {recordOwner(selected)}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              {recordStatus(kind, selected)}
            </Descriptions.Item>
            <Descriptions.Item label="业务时间">
              {formatDate(recordTime(kind, selected))}
            </Descriptions.Item>
            <Descriptions.Item label="内容">
              {selected.content ??
                selected.description ??
                selected.objectives ??
                "-"}
            </Descriptions.Item>
            {kind === "pickup" ? (
              <>
                <Descriptions.Item label="业务日期">
                  {selected.serviceDate
                    ? String(selected.serviceDate).slice(0, 10)
                    : "-"}
                </Descriptions.Item>
                <Descriptions.Item
                  label={
                    selected.type === "arrived_at_center" ? "送达人" : "接送人"
                  }
                >
                  {selected.pickupPersonNameSnapshot
                    ? `${selected.relationshipSnapshot ?? ""} ${selected.pickupPersonNameSnapshot}`
                    : "-"}
                </Descriptions.Item>
                <Descriptions.Item
                  label={
                    selected.type === "arrived_at_center"
                      ? "送达人电话"
                      : "接送人电话"
                  }
                >
                  {selected.phoneSnapshot ?? "-"}
                </Descriptions.Item>
                <Descriptions.Item label="到店方式">
                  {selected.arrivalMethod ?? "-"}
                </Descriptions.Item>
                <Descriptions.Item label="异常原因">
                  {selected.exceptionReason ?? "-"}
                </Descriptions.Item>
                <Descriptions.Item label="处理结果">
                  {selected.resolution ?? "-"}
                </Descriptions.Item>
                <Descriptions.Item label="备注">
                  {selected.remark ?? "-"}
                </Descriptions.Item>
              </>
            ) : null}
            <Descriptions.Item label="记录编号">
              {selected.id}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </Space>
  );
}
