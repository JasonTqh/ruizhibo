import { useEffect, useMemo, useState } from "react";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { API_BASE_URL } from "../config";

type ApiResult<T> = { data: T };

async function submitChange(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    Modal.error({
      title: "操作失败",
      content: error instanceof Error ? error.message : "请稍后重试",
    });
  }
}

interface UserSummary {
  id: string;
  role: string;
  name: string;
  phone?: string;
  status?: string;
}

interface ParentSummary extends UserSummary {
  guardianships?: Array<{
    id: string;
    relation: string;
    isPrimary: boolean;
    canReceiveNotice: boolean;
    canSubmitHomework: boolean;
    canViewGrowth: boolean;
    status: string;
    remark?: string;
    student: { id: string; name: string; class: { name: string } };
  }>;
}

interface ClassSummary {
  id: string;
  campusId: string;
  name: string;
  teacherId?: string;
  campus?: { id: string; name: string };
  teacher?: UserSummary | null;
  _count?: { students: number };
}

interface StudentSummary {
  id: string;
  classId: string;
  name: string;
  gender?: string;
  status: string;
  class?: ClassSummary;
  guardians?: Array<{
    id: string;
    relation: string;
    isPrimary: boolean;
    canReceiveNotice: boolean;
    canSubmitHomework: boolean;
    canViewGrowth: boolean;
    status: string;
    remark?: string;
    parent: UserSummary;
  }>;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  _count?: { sessions: number };
  steps: Array<{
    id: string;
    stepKey: string;
    name: string;
    timeRange: string;
    sortOrder: number;
    requirePhoto: boolean;
  }>;
}

interface WorkflowReference {
  id: string;
  date: string;
  status: string;
  class: { id: string; name: string };
  teacher: { id: string; name: string };
  _count: { steps: number };
}

type ReferenceCounts = Record<string, number>;

function ReferenceSummary({
  counts,
  labels,
}: {
  counts: ReferenceCounts;
  labels: Record<string, string>;
}) {
  return (
    <Descriptions bordered size="small" column={2}>
      {Object.entries(labels).map(([key, label]) => (
        <Descriptions.Item key={key} label={label}>
          {counts[key] ?? 0}
        </Descriptions.Item>
      ))}
    </Descriptions>
  );
}

const classReferenceLabels = {
  students: "学生",
  workflowSessions: "一日流程",
  homeworkAssignments: "作业",
  teachingRecords: "教学记录",
  lessonPlans: "教案",
  notices: "通知/任务",
  studentGuardians: "学生家长绑定",
  studentAttendance: "学生考勤",
  studentSubmissions: "学生作业提交",
  studentGrowthRecords: "学生成长记录",
  studentConversations: "学生家校会话",
  studentNoticeReceipts: "学生通知回执",
};

const studentReferenceLabels = {
  guardians: "家长绑定",
  attendance: "考勤记录",
  submissions: "作业提交",
  growthRecords: "成长记录",
  conversations: "家校会话",
  noticeReceipts: "通知回执",
};

const parentReferenceLabels = {
  guardianships: "学生绑定",
  noticeReceipts: "通知回执",
  conversations: "家校会话",
};

function referenceTotal(counts: ReferenceCounts) {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

const defaultWorkflowSteps = [
  {
    stepKey: "arrive",
    name: "到校签到",
    timeRange: "16:30-17:00",
    sortOrder: 10,
    requirePhoto: false,
  },
  {
    stepKey: "homework",
    name: "作业辅导",
    timeRange: "17:00-18:20",
    sortOrder: 20,
    requirePhoto: false,
  },
  {
    stepKey: "leave",
    name: "离校交接",
    timeRange: "20:00-20:30",
    sortOrder: 30,
    requirePhoto: false,
  },
];

function workflowFormValues(template?: WorkflowTemplate) {
  return template
    ? {
        name: template.name,
        version: template.version,
        isActive: template.isActive,
        steps: template.steps.map(
          ({ stepKey, name, timeRange, sortOrder, requirePhoto }) => ({
            stepKey,
            name,
            timeRange,
            sortOrder,
            requirePhoto,
          }),
        ),
      }
    : {
        name: "托管一日流程",
        version: 1,
        isActive: true,
        steps: defaultWorkflowSteps,
      };
}

const modules = [
  { key: "dashboard", label: "工作台" },
  { key: "teachers", label: "老师管理" },
  { key: "parents", label: "家长管理" },
  { key: "classes", label: "班级管理" },
  { key: "students", label: "学生管理" },
  { key: "workflow", label: "流程模板" },
  { key: "audit", label: "审计日志" },
];

export function App() {
  const [activeKey, setActiveKey] = useState("dashboard");
  const [token, setToken] = useState(
    () => localStorage.getItem("adminToken") ?? "",
  );
  const [message, setMessage] = useState("");
  const [teachers, setTeachers] = useState<UserSummary[]>([]);
  const [parents, setParents] = useState<ParentSummary[]>([]);
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const dashboard = useMemo(
    () => ({
      teachers: teachers.length,
      parents: parents.length,
      classes: classes.length,
      students: students.length,
      templates: templates.length,
    }),
    [
      classes.length,
      parents.length,
      students.length,
      teachers.length,
      templates.length,
    ],
  );

  async function request<T>(path: string, options: RequestInit = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const body = (await response.json()) as
      ApiResult<T> | { error: { message: string } };
    if (!response.ok) {
      throw new Error("error" in body ? body.error.message : "Request failed");
    }
    return (body as ApiResult<T>).data;
  }

  async function refreshAll() {
    if (!token) return;
    const [
      nextTeachers,
      nextParents,
      nextClasses,
      nextStudents,
      nextTemplates,
      nextAuditLogs,
    ] = await Promise.all([
      request<UserSummary[]>("/admin/teachers"),
      request<ParentSummary[]>("/admin/parents"),
      request<ClassSummary[]>("/admin/classes"),
      request<StudentSummary[]>("/admin/students"),
      request<WorkflowTemplate[]>("/admin/workflow-templates"),
      request<any[]>("/admin/audit-logs"),
    ]);
    setTeachers(nextTeachers);
    setParents(nextParents);
    setClasses(nextClasses);
    setStudents(nextStudents);
    setTemplates(nextTemplates);
    setAuditLogs(nextAuditLogs);
  }

  async function login() {
    setMessage("");
    const data = await fetch(`${API_BASE_URL}/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin", phone: "13800000000" }),
    }).then(
      (response) => response.json() as Promise<ApiResult<{ token: string }>>,
    );
    localStorage.setItem("adminToken", data.data.token);
    setToken(data.data.token);
    setMessage("管理员已登录");
  }

  useEffect(() => {
    refreshAll().catch((error: Error) => setMessage(error.message));
  }, [token]);

  return (
    <Layout className="admin-shell">
      <Layout.Sider width={220} className="admin-sider">
        <div className="brand">锐之博后台</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeKey]}
          items={modules}
          onClick={(item) => setActiveKey(item.key)}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header className="admin-header">
          <Typography.Title level={3}>运营管理工作台</Typography.Title>
          <Space>
            <Button onClick={login}>开发登录</Button>
            <Button onClick={refreshAll} disabled={!token}>
              刷新
            </Button>
          </Space>
        </Layout.Header>
        <Layout.Content className="admin-content">
          {message ? (
            <Alert className="admin-alert" message={message} type="info" />
          ) : null}
          {activeKey === "dashboard" ? (
            <Dashboard dashboard={dashboard} />
          ) : activeKey === "teachers" ? (
            <TeachersPanel
              teachers={teachers}
              request={request}
              refreshAll={refreshAll}
            />
          ) : activeKey === "parents" ? (
            <ParentsPanel
              parents={parents}
              students={students}
              request={request}
              refreshAll={refreshAll}
            />
          ) : activeKey === "classes" ? (
            <ClassesPanel
              classes={classes}
              teachers={teachers}
              request={request}
              refreshAll={refreshAll}
            />
          ) : activeKey === "students" ? (
            <StudentsPanel
              classes={classes}
              students={students}
              parents={parents}
              request={request}
              refreshAll={refreshAll}
            />
          ) : activeKey === "workflow" ? (
            <WorkflowPanel
              templates={templates}
              request={request}
              refreshAll={refreshAll}
            />
          ) : (
            <AuditPanel logs={auditLogs} />
          )}
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

function Dashboard({ dashboard }: { dashboard: Record<string, number> }) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic title="老师" value={dashboard.teachers} />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic title="家长" value={dashboard.parents} />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic title="班级" value={dashboard.classes} />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic title="学生" value={dashboard.students} />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic title="流程模板" value={dashboard.templates} />
        </Card>
      </Col>
    </Row>
  );
}

function TeachersPanel({
  teachers,
  request,
  refreshAll,
}: {
  teachers: UserSummary[];
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  refreshAll: () => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [editing, setEditing] = useState<UserSummary | null>(null);
  return (
    <Space direction="vertical" size={16} className="admin-stack">
      <Card title="新增老师">
        <Form
          form={form}
          layout="inline"
          onFinish={async (values) => {
            await request("/admin/teachers", {
              method: "POST",
              body: JSON.stringify({ ...values, status: "active" }),
            });
            form.resetFields();
            await refreshAll();
          }}
        >
          <Form.Item name="name" rules={[{ required: true }]}>
            <Input placeholder="姓名" />
          </Form.Item>
          <Form.Item name="phone" rules={[{ required: true }]}>
            <Input placeholder="手机号" />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            创建
          </Button>
        </Form>
      </Card>
      <Table
        rowKey="id"
        dataSource={teachers}
        columns={[
          { title: "姓名", dataIndex: "name" },
          { title: "手机号", dataIndex: "phone" },
          {
            title: "状态",
            dataIndex: "status",
            render: (value) => <Tag>{value}</Tag>,
          },
          {
            title: "操作",
            render: (_, record) => (
              <Space>
                <Button
                  type="link"
                  onClick={() => {
                    setEditing(record);
                    editForm.setFieldsValue(record);
                  }}
                >
                  编辑
                </Button>
                <Popconfirm
                  title="确定删除这位老师吗？"
                  description="已有班级或业务记录的老师不能删除。"
                  onConfirm={() =>
                    submitChange(async () => {
                      await request(`/admin/teachers/${record.id}`, {
                        method: "DELETE",
                      });
                      await refreshAll();
                    })
                  }
                >
                  <Button type="link" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title="编辑老师"
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) =>
            submitChange(async () => {
              await request(`/admin/teachers/${editing!.id}`, {
                method: "PATCH",
                body: JSON.stringify(values),
              });
              setEditing(null);
              await refreshAll();
            })
          }
        >
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机号" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select
              options={[
                { label: "启用", value: "active" },
                { label: "停用", value: "disabled" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

interface BindingView {
  id: string;
  studentId: string;
  studentName: string;
  parentId: string;
  parentName: string;
  relation: string;
  isPrimary: boolean;
  canReceiveNotice: boolean;
  canSubmitHomework: boolean;
  canViewGrowth: boolean;
  status: string;
  remark?: string;
}

function GuardianManager({
  student,
  parent,
  students,
  parents,
  request,
  refreshAll,
  onClose,
}: {
  student?: StudentSummary;
  parent?: ParentSummary;
  students: StudentSummary[];
  parents: ParentSummary[];
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  refreshAll: () => Promise<void>;
  onClose: () => void;
}) {
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<BindingView | null>(null);
  const bindings: BindingView[] = student
    ? (student.guardians ?? [])
        .filter((item) => item.status !== "unlinked")
        .map((item) => ({
          ...item,
          studentId: student.id,
          studentName: student.name,
          parentId: item.parent.id,
          parentName: item.parent.name,
        }))
    : (parent?.guardianships ?? [])
        .filter((item) => item.status !== "unlinked")
        .map((item) => ({
          ...item,
          studentId: item.student.id,
          studentName: item.student.name,
          parentId: parent!.id,
          parentName: parent!.name,
        }));

  function resetForm() {
    setEditing(null);
    form.setFieldsValue({
      studentId: student?.id,
      parentId: parent?.id,
      relation: "母亲",
      isPrimary: false,
      canReceiveNotice: true,
      canSubmitHomework: true,
      canViewGrowth: true,
      status: "active",
      remark: "",
    });
  }

  useEffect(resetForm, [student?.id, parent?.id]);

  return (
    <Drawer
      title={`管理绑定 · ${student?.name ?? parent?.name ?? ""}`}
      open={Boolean(student || parent)}
      width={900}
      onClose={onClose}
    >
      <Card title={editing ? "编辑绑定关系" : "新增绑定关系"} size="small">
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            submitChange(async () => {
              const studentId = student?.id ?? values.studentId;
              const body = {
                ...values,
                parentId: parent?.id ?? values.parentId,
              };
              delete body.studentId;
              await request(
                editing
                  ? `/admin/students/${studentId}/guardians/${editing.id}`
                  : `/admin/students/${studentId}/guardians`,
                {
                  method: editing ? "PATCH" : "POST",
                  body: JSON.stringify(body),
                },
              );
              resetForm();
              await refreshAll();
            })
          }
        >
          <Row gutter={12}>
            {!student ? (
              <Col span={8}>
                <Form.Item
                  name="studentId"
                  label="学生"
                  rules={[{ required: true }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={students.map((item) => ({
                      label: `${item.name}（${item.class?.name ?? ""}）`,
                      value: item.id,
                    }))}
                  />
                </Form.Item>
              </Col>
            ) : null}
            {!parent ? (
              <Col span={8}>
                <Form.Item
                  name="parentId"
                  label="家长"
                  rules={[{ required: true }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={parents.map((item) => ({
                      label: `${item.name}（${item.phone ?? "无手机号"}）`,
                      value: item.id,
                    }))}
                  />
                </Form.Item>
              </Col>
            ) : null}
            <Col span={8}>
              <Form.Item
                name="relation"
                label="关系"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    "父亲",
                    "母亲",
                    "祖父",
                    "祖母",
                    "外祖父",
                    "外祖母",
                    "其他",
                  ].map((value) => ({ label: value, value }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="status"
                label="状态"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { label: "正常", value: "active" },
                    { label: "待确认", value: "pending" },
                    { label: "已解除", value: "unlinked" },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Space size="large" wrap>
            <Form.Item
              name="isPrimary"
              label="主要联系人"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="canReceiveNotice"
              label="接收通知"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="canSubmitHomework"
              label="提交作业"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="canViewGrowth"
              label="查看成长"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注">
            <Input />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              {editing ? "保存关系" : "添加绑定"}
            </Button>
            {editing ? <Button onClick={resetForm}>取消编辑</Button> : null}
          </Space>
        </Form>
      </Card>
      <Table
        style={{ marginTop: 16 }}
        rowKey="id"
        dataSource={bindings}
        columns={[
          {
            title: student ? "家长" : "学生",
            render: (_, item) => (student ? item.parentName : item.studentName),
          },
          { title: "关系", dataIndex: "relation" },
          {
            title: "主要联系人",
            render: (_, item) =>
              item.isPrimary ? <Tag color="green">是</Tag> : "否",
          },
          {
            title: "权限",
            render: (_, item) =>
              [
                item.canReceiveNotice && "通知",
                item.canSubmitHomework && "作业",
                item.canViewGrowth && "成长",
              ]
                .filter(Boolean)
                .join("、") || "无",
          },
          { title: "状态", dataIndex: "status" },
          {
            title: "操作",
            render: (_, item) => (
              <Space>
                <Button
                  type="link"
                  onClick={() => {
                    setEditing(item);
                    form.setFieldsValue(item);
                  }}
                >
                  编辑
                </Button>
                <Popconfirm
                  title="解除这条绑定关系？"
                  onConfirm={() =>
                    submitChange(async () => {
                      await request(
                        `/admin/students/${item.studentId}/guardians/${item.id}`,
                        { method: "DELETE" },
                      );
                      await refreshAll();
                    })
                  }
                >
                  <Button type="link" danger>
                    解除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </Drawer>
  );
}

function ParentsPanel({
  parents,
  students,
  request,
  refreshAll,
}: {
  parents: ParentSummary[];
  students: StudentSummary[];
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  refreshAll: () => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [editing, setEditing] = useState<ParentSummary | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [referenceTarget, setReferenceTarget] = useState<{
    record: ParentSummary;
    counts: ReferenceCounts;
  } | null>(null);

  async function loadReferences(record: ParentSummary) {
    await submitChange(async () => {
      const counts = await request<ReferenceCounts>(
        `/admin/parents/${record.id}/references`,
      );
      setReferenceTarget({ record, counts });
    });
  }

  async function deleteParent(record: ParentSummary) {
    await submitChange(async () => {
      const counts = await request<ReferenceCounts>(
        `/admin/parents/${record.id}/references`,
      );
      const total = referenceTotal(counts);
      if (total > 0 && record.status === "active") {
        Modal.warning({
          title: "请先停用家长",
          content: `该家长共有 ${total} 条关联记录。请先编辑并设为停用，再清理引用并删除。`,
        });
        return;
      }
      Modal.confirm({
        title: total ? "清理关联数据并删除家长？" : "删除家长？",
        content: total ? (
          <Space direction="vertical" className="admin-stack">
            <Typography.Text type="danger">
              将解除学生绑定并删除该家长的回执和会话记录，此操作不可撤销。
            </Typography.Text>
            <ReferenceSummary counts={counts} labels={parentReferenceLabels} />
          </Space>
        ) : (
          "该家长没有关联数据，删除后不可恢复。"
        ),
        okText: total ? "清理并删除" : "删除",
        okButtonProps: { danger: true },
        onOk: () =>
          submitChange(async () => {
            await request(
              `/admin/parents/${record.id}${total ? "?force=true" : ""}`,
              { method: "DELETE" },
            );
            await refreshAll();
          }),
      });
    });
  }

  return (
    <Space direction="vertical" size={16} className="admin-stack">
      <Card title="新增家长">
        <Form
          form={form}
          layout="inline"
          onFinish={(values) =>
            submitChange(async () => {
              await request("/admin/parents", {
                method: "POST",
                body: JSON.stringify({ ...values, status: "active" }),
              });
              form.resetFields();
              await refreshAll();
            })
          }
        >
          <Form.Item
            name="name"
            rules={[{ required: true, message: "请输入姓名" }]}
          >
            <Input placeholder="家长姓名" />
          </Form.Item>
          <Form.Item
            name="phone"
            rules={[
              { required: true, message: "请输入手机号" },
              { pattern: /^1\d{10}$/, message: "请输入正确的手机号" },
            ]}
          >
            <Input placeholder="手机号" />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            创建
          </Button>
        </Form>
      </Card>
      <Table
        rowKey="id"
        dataSource={parents}
        columns={[
          { title: "姓名", dataIndex: "name" },
          { title: "手机号", dataIndex: "phone" },
          {
            title: "状态",
            dataIndex: "status",
            render: (value) => (
              <Tag>{value === "active" ? "启用" : "停用"}</Tag>
            ),
          },
          {
            title: "绑定学生",
            render: (_, record) =>
              record.guardianships?.some((item) => item.status !== "unlinked")
                ? record.guardianships
                    .filter((item) => item.status !== "unlinked")
                    .map((item) => (
                      <Tag key={item.id}>
                        {item.student.name}（{item.relation}，
                        {item.student.class.name}）
                      </Tag>
                    ))
                : "未绑定",
          },
          {
            title: "操作",
            render: (_, record) => (
              <Space>
                <Button type="link" onClick={() => setManagingId(record.id)}>
                  管理绑定
                </Button>
                <Button type="link" onClick={() => loadReferences(record)}>
                  查看引用
                </Button>
                <Button
                  type="link"
                  onClick={() => {
                    setEditing(record);
                    editForm.setFieldsValue(record);
                  }}
                >
                  编辑
                </Button>
                <Button type="link" danger onClick={() => deleteParent(record)}>
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title="编辑家长"
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) =>
            submitChange(async () => {
              await request(`/admin/parents/${editing!.id}`, {
                method: "PATCH",
                body: JSON.stringify(values),
              });
              setEditing(null);
              await refreshAll();
            })
          }
        >
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="phone"
            label="手机号"
            rules={[
              { required: true },
              { pattern: /^1\d{10}$/, message: "请输入正确的手机号" },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select
              options={[
                { label: "启用", value: "active" },
                { label: "停用", value: "disabled" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
      <GuardianManager
        parent={parents.find((item) => item.id === managingId)}
        students={students}
        parents={parents}
        request={request}
        refreshAll={refreshAll}
        onClose={() => setManagingId(null)}
      />
      <Modal
        title={`${referenceTarget?.record.name ?? "家长"}的引用`}
        open={Boolean(referenceTarget)}
        footer={null}
        onCancel={() => setReferenceTarget(null)}
      >
        {referenceTarget ? (
          <ReferenceSummary
            counts={referenceTarget.counts}
            labels={parentReferenceLabels}
          />
        ) : null}
      </Modal>
    </Space>
  );
}

function ClassesPanel({
  classes,
  teachers,
  request,
  refreshAll,
}: {
  classes: ClassSummary[];
  teachers: UserSummary[];
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  refreshAll: () => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [editing, setEditing] = useState<ClassSummary | null>(null);
  const [referenceTarget, setReferenceTarget] = useState<{
    record: ClassSummary;
    counts: ReferenceCounts;
  } | null>(null);

  async function loadClassReferences(record: ClassSummary) {
    await submitChange(async () => {
      const counts = await request<ReferenceCounts>(
        `/admin/classes/${record.id}/references`,
      );
      setReferenceTarget({ record, counts });
    });
  }

  async function deleteClass(record: ClassSummary) {
    await submitChange(async () => {
      const counts = await request<ReferenceCounts>(
        `/admin/classes/${record.id}/references`,
      );
      const total = referenceTotal(counts);
      Modal.confirm({
        title: total ? "清理关联数据并删除班级？" : "删除班级？",
        content: total ? (
          <Space direction="vertical" className="admin-stack">
            <Typography.Text type="danger">
              将永久删除该班级及以下关联数据，此操作不可撤销。
            </Typography.Text>
            <ReferenceSummary counts={counts} labels={classReferenceLabels} />
          </Space>
        ) : (
          "该班级没有关联数据，删除后不可恢复。"
        ),
        okText: total ? "清理并删除" : "删除",
        okButtonProps: { danger: true },
        onOk: () =>
          submitChange(async () => {
            await request(
              `/admin/classes/${record.id}${total ? "?force=true" : ""}`,
              {
                method: "DELETE",
              },
            );
            await refreshAll();
          }),
      });
    });
  }
  return (
    <Space direction="vertical" size={16} className="admin-stack">
      <Card title="新增班级">
        <Form
          form={form}
          layout="inline"
          initialValues={{ campusId: "seed-campus-main" }}
          onFinish={async (values) => {
            await request("/admin/classes", {
              method: "POST",
              body: JSON.stringify(values),
            });
            form.resetFields();
            await refreshAll();
          }}
        >
          <Form.Item name="campusId" rules={[{ required: true }]}>
            <Input placeholder="校区 ID" />
          </Form.Item>
          <Form.Item name="name" rules={[{ required: true }]}>
            <Input placeholder="班级名" />
          </Form.Item>
          <Form.Item name="teacherId">
            <Select
              allowClear
              placeholder="老师"
              style={{ width: 180 }}
              options={teachers.map((teacher) => ({
                label: teacher.name,
                value: teacher.id,
              }))}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            创建
          </Button>
        </Form>
      </Card>
      <Table
        rowKey="id"
        dataSource={classes}
        columns={[
          { title: "班级", dataIndex: "name" },
          {
            title: "校区",
            render: (_, record) => record.campus?.name ?? record.campusId,
          },
          {
            title: "老师",
            render: (_, record) => record.teacher?.name ?? "未分配",
          },
          {
            title: "学生数",
            render: (_, record) => record._count?.students ?? 0,
          },
          {
            title: "操作",
            render: (_, record) => (
              <Space>
                <Button type="link" onClick={() => loadClassReferences(record)}>
                  查看引用
                </Button>
                <Button
                  type="link"
                  onClick={() => {
                    setEditing(record);
                    editForm.setFieldsValue(record);
                  }}
                >
                  编辑
                </Button>
                <Button type="link" danger onClick={() => deleteClass(record)}>
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title="编辑班级"
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) =>
            submitChange(async () => {
              await request(`/admin/classes/${editing!.id}`, {
                method: "PATCH",
                body: JSON.stringify(values),
              });
              setEditing(null);
              await refreshAll();
            })
          }
        >
          <Form.Item name="name" label="班级名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="campusId"
            label="校区 ID"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="teacherId" label="老师">
            <Select
              allowClear
              options={teachers.map((teacher) => ({
                label: teacher.name,
                value: teacher.id,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`${referenceTarget?.record.name ?? "班级"}的引用`}
        open={Boolean(referenceTarget)}
        footer={null}
        onCancel={() => setReferenceTarget(null)}
      >
        {referenceTarget ? (
          <ReferenceSummary
            counts={referenceTarget.counts}
            labels={classReferenceLabels}
          />
        ) : null}
      </Modal>
    </Space>
  );
}

function StudentsPanel({
  classes,
  students,
  parents,
  request,
  refreshAll,
}: {
  classes: ClassSummary[];
  students: StudentSummary[];
  parents: ParentSummary[];
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  refreshAll: () => Promise<void>;
}) {
  const [studentForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [editing, setEditing] = useState<StudentSummary | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [referenceTarget, setReferenceTarget] = useState<{
    record: StudentSummary;
    counts: ReferenceCounts;
  } | null>(null);

  async function loadStudentReferences(record: StudentSummary) {
    await submitChange(async () => {
      const counts = await request<ReferenceCounts>(
        `/admin/students/${record.id}/references`,
      );
      setReferenceTarget({ record, counts });
    });
  }

  async function deleteStudent(record: StudentSummary) {
    await submitChange(async () => {
      const counts = await request<ReferenceCounts>(
        `/admin/students/${record.id}/references`,
      );
      const total = referenceTotal(counts);
      if (total > 0 && record.status === "active") {
        Modal.warning({
          title: "请先停用学生",
          content: `该学生共有 ${total} 条关联记录。请先编辑学生，将状态设为“停用”或“结业”，再执行清理并删除。`,
        });
        return;
      }
      Modal.confirm({
        title: total ? "清理关联数据并删除学生？" : "删除学生？",
        content: total ? (
          <Space direction="vertical" className="admin-stack">
            <Typography.Text type="danger">
              将永久删除该学生及以下关联数据，此操作不可撤销。
            </Typography.Text>
            <ReferenceSummary counts={counts} labels={studentReferenceLabels} />
          </Space>
        ) : (
          "该学生没有关联数据，删除后不可恢复。"
        ),
        okText: total ? "清理并删除" : "删除",
        okButtonProps: { danger: true },
        onOk: () =>
          submitChange(async () => {
            await request(
              `/admin/students/${record.id}${total ? "?force=true" : ""}`,
              {
                method: "DELETE",
              },
            );
            await refreshAll();
          }),
      });
    });
  }
  return (
    <Space direction="vertical" size={16} className="admin-stack">
      <Card title="新增学生">
        <Form
          form={studentForm}
          layout="inline"
          onFinish={(values) =>
            submitChange(async () => {
              const created = await request<StudentSummary>("/admin/students", {
                method: "POST",
                body: JSON.stringify({ ...values, status: "active" }),
              });
              studentForm.resetFields();
              await refreshAll();
              Modal.success({
                title: "学生创建成功",
                content: `${created.name} 已加入所选班级，并显示在学生列表顶部。`,
              });
            })
          }
        >
          <Form.Item
            name="classId"
            rules={[{ required: true, message: "请选择班级" }]}
          >
            <Select
              placeholder="班级"
              style={{ width: 180 }}
              options={classes.map((klass) => ({
                label: klass.name,
                value: klass.id,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="name"
            rules={[
              { required: true, message: "请输入学生姓名" },
              { whitespace: true, message: "学生姓名不能为空" },
            ]}
          >
            <Input placeholder="学生姓名" />
          </Form.Item>
          <Form.Item name="gender">
            <Input placeholder="性别" />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            创建
          </Button>
        </Form>
      </Card>
      <Table
        rowKey="id"
        dataSource={students}
        locale={{ emptyText: "暂无学生，请先在上方创建" }}
        columns={[
          { title: "学生", dataIndex: "name" },
          {
            title: "班级",
            render: (_, record) => record.class?.name ?? record.classId,
          },
          { title: "状态", dataIndex: "status" },
          {
            title: "家长",
            render: (_, record) =>
              record.guardians
                ?.filter((item) => item.status !== "unlinked")
                .map((item) => (
                  <Tag
                    key={item.id}
                    closable
                    onClose={(event) => {
                      event.preventDefault();
                      Modal.confirm({
                        title: `解除与${item.parent.name}的绑定？`,
                        onOk: () =>
                          submitChange(async () => {
                            await request(
                              `/admin/students/${record.id}/guardians/${item.id}`,
                              { method: "DELETE" },
                            );
                            await refreshAll();
                          }),
                      });
                    }}
                  >
                    {item.parent.name}（{item.relation}）
                  </Tag>
                )) ?? "",
          },
          {
            title: "操作",
            render: (_, record) => (
              <Space>
                <Button type="link" onClick={() => setManagingId(record.id)}>
                  管理家长
                </Button>
                <Button
                  type="link"
                  onClick={() => loadStudentReferences(record)}
                >
                  查看引用
                </Button>
                <Button
                  type="link"
                  onClick={() => {
                    setEditing(record);
                    editForm.setFieldsValue(record);
                  }}
                >
                  编辑
                </Button>
                <Button
                  type="link"
                  danger
                  onClick={() => deleteStudent(record)}
                >
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title="编辑学生"
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) =>
            submitChange(async () => {
              await request(`/admin/students/${editing!.id}`, {
                method: "PATCH",
                body: JSON.stringify(values),
              });
              setEditing(null);
              await refreshAll();
            })
          }
        >
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="classId" label="班级" rules={[{ required: true }]}>
            <Select
              options={classes.map((klass) => ({
                label: klass.name,
                value: klass.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="gender" label="性别">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select
              options={[
                { label: "在读", value: "active" },
                { label: "停用", value: "inactive" },
                { label: "结业", value: "graduated" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
      <GuardianManager
        student={students.find((item) => item.id === managingId)}
        students={students}
        parents={parents}
        request={request}
        refreshAll={refreshAll}
        onClose={() => setManagingId(null)}
      />
      <Modal
        title={`${referenceTarget?.record.name ?? "学生"}的引用`}
        open={Boolean(referenceTarget)}
        footer={null}
        onCancel={() => setReferenceTarget(null)}
      >
        {referenceTarget ? (
          <ReferenceSummary
            counts={referenceTarget.counts}
            labels={studentReferenceLabels}
          />
        ) : null}
      </Modal>
    </Space>
  );
}

function WorkflowStepsEditor() {
  return (
    <Form.List
      name="steps"
      rules={[
        {
          validator: async (_, steps) => {
            if (!steps?.length) throw new Error("至少添加一个流程步骤");
            const keys = steps
              .map((step: { stepKey?: string }) => step?.stepKey)
              .filter(Boolean);
            if (new Set(keys).size !== keys.length) {
              throw new Error("步骤标识不能重复");
            }
          },
        },
      ]}
    >
      {(fields, { add, remove }, { errors }) => (
        <Space direction="vertical" className="admin-stack" size={12}>
          {fields.map((field, index) => (
            <Card
              key={field.key}
              size="small"
              title={`步骤 ${index + 1}`}
              extra={
                <Button
                  type="text"
                  danger
                  icon={<MinusCircleOutlined />}
                  onClick={() => remove(field.name)}
                >
                  删除步骤
                </Button>
              }
            >
              <Row gutter={12}>
                <Col xs={24} md={6}>
                  <Form.Item
                    {...field}
                    name={[field.name, "name"]}
                    label="步骤名称"
                    rules={[{ required: true, message: "请输入步骤名称" }]}
                  >
                    <Input placeholder="例如：到校签到" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={5}>
                  <Form.Item
                    {...field}
                    name={[field.name, "stepKey"]}
                    label="步骤标识"
                    rules={[
                      { required: true, message: "请输入步骤标识" },
                      {
                        pattern: /^[a-z][a-z0-9_-]*$/,
                        message: "使用小写字母、数字、_ 或 -",
                      },
                    ]}
                  >
                    <Input placeholder="arrive" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={5}>
                  <Form.Item
                    {...field}
                    name={[field.name, "timeRange"]}
                    label="时间范围"
                    rules={[{ required: true, message: "请输入时间范围" }]}
                  >
                    <Input placeholder="16:30-17:00" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Item
                    {...field}
                    name={[field.name, "sortOrder"]}
                    label="排序"
                    rules={[{ required: true, message: "请输入排序" }]}
                  >
                    <InputNumber
                      min={0}
                      precision={0}
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Item
                    {...field}
                    name={[field.name, "requirePhoto"]}
                    label="要求照片"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          ))}
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() =>
              add({
                stepKey: `step_${fields.length + 1}`,
                name: "",
                timeRange: "",
                sortOrder: (fields.length + 1) * 10,
                requirePhoto: false,
              })
            }
          >
            添加步骤
          </Button>
          <Form.ErrorList errors={errors} />
        </Space>
      )}
    </Form.List>
  );
}

function WorkflowPanel({
  templates,
  request,
  refreshAll,
}: {
  templates: WorkflowTemplate[];
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  refreshAll: () => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [editing, setEditing] = useState<WorkflowTemplate | null>(null);
  const [references, setReferences] = useState<WorkflowReference[] | null>(
    null,
  );
  const [referenceTemplate, setReferenceTemplate] =
    useState<WorkflowTemplate | null>(null);

  async function loadReferences(template: WorkflowTemplate) {
    await submitChange(async () => {
      const data = await request<WorkflowReference[]>(
        `/admin/workflow-templates/${template.id}/references`,
      );
      setReferenceTemplate(template);
      setReferences(data);
    });
  }

  function deleteTemplate(template: WorkflowTemplate) {
    const referenceCount = template._count?.sessions ?? 0;
    if (referenceCount > 0 && template.isActive) {
      Modal.warning({
        title: "请先停用模板",
        content: `该模板被 ${referenceCount} 条一日流程引用。先编辑并停用模板，再执行清理引用并删除。`,
      });
      return;
    }
    Modal.confirm({
      title: referenceCount > 0 ? "清理引用并删除模板？" : "删除模板？",
      content:
        referenceCount > 0
          ? `将永久删除 ${referenceCount} 条一日流程及其步骤打卡记录，此操作不可撤销。`
          : "该模板没有业务引用，删除后不可恢复。",
      okText: referenceCount > 0 ? "清理并删除" : "删除",
      okButtonProps: { danger: true },
      onOk: () =>
        submitChange(async () => {
          await request(
            `/admin/workflow-templates/${template.id}${referenceCount > 0 ? "?force=true" : ""}`,
            { method: "DELETE" },
          );
          await refreshAll();
        }),
    });
  }
  return (
    <Space direction="vertical" size={16} className="admin-stack">
      <Card title="创建流程模板">
        <Form
          form={form}
          layout="vertical"
          initialValues={workflowFormValues()}
          onFinish={(values) =>
            submitChange(async () => {
              await request("/admin/workflow-templates", {
                method: "POST",
                body: JSON.stringify(values),
              });
              form.resetFields();
              await refreshAll();
            })
          }
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="name"
                label="模板名称"
                rules={[{ required: true }]}
              >
                <Input placeholder="模板名称" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item
                name="version"
                label="版本"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} precision={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item
                name="isActive"
                label="创建后启用"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <WorkflowStepsEditor />
          <Button type="primary" htmlType="submit" style={{ marginTop: 16 }}>
            创建模板
          </Button>
        </Form>
      </Card>
      <Tabs
        items={templates.map((template) => ({
          key: template.id,
          label: template.name,
          children: (
            <Space direction="vertical" className="admin-stack">
              <Space>
                <Tag color={template.isActive ? "green" : "default"}>
                  {template.isActive ? "启用" : "停用"}
                </Tag>
                <Button onClick={() => loadReferences(template)}>
                  查看引用（{template._count?.sessions ?? 0}）
                </Button>
                <Button
                  onClick={() => {
                    setEditing(template);
                    editForm.setFieldsValue(workflowFormValues(template));
                  }}
                >
                  编辑模板
                </Button>
                <Button danger onClick={() => deleteTemplate(template)}>
                  删除模板
                </Button>
              </Space>
              <Table
                rowKey="id"
                dataSource={template.steps}
                columns={[
                  { title: "步骤", dataIndex: "name" },
                  { title: "时间", dataIndex: "timeRange" },
                  { title: "排序", dataIndex: "sortOrder" },
                ]}
              />
            </Space>
          ),
        }))}
      />
      <Modal
        title="编辑流程模板"
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
        width={960}
        okText="保存修改"
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) =>
            submitChange(async () => {
              await request(`/admin/workflow-templates/${editing!.id}`, {
                method: "PATCH",
                body: JSON.stringify(values),
              });
              setEditing(null);
              await refreshAll();
            })
          }
        >
          <Form.Item name="name" label="模板名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="version" label="版本" rules={[{ required: true }]}>
            <InputNumber min={1} />
          </Form.Item>
          <Form.Item name="isActive" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <WorkflowStepsEditor />
        </Form>
      </Modal>
      <Modal
        title={`${referenceTemplate?.name ?? "流程模板"}的引用`}
        open={references !== null}
        footer={null}
        width={760}
        onCancel={() => {
          setReferences(null);
          setReferenceTemplate(null);
        }}
      >
        <Table
          rowKey="id"
          dataSource={references ?? []}
          locale={{ emptyText: "没有一日流程引用，可以直接删除" }}
          columns={[
            {
              title: "日期",
              dataIndex: "date",
              render: (value: string) =>
                new Date(value).toLocaleDateString("zh-CN"),
            },
            { title: "班级", render: (_, record) => record.class.name },
            { title: "老师", render: (_, record) => record.teacher.name },
            { title: "状态", dataIndex: "status" },
            { title: "步骤数", render: (_, record) => record._count.steps },
          ]}
        />
      </Modal>
    </Space>
  );
}

function AuditPanel({ logs }: { logs: any[] }) {
  return (
    <Table
      rowKey="id"
      dataSource={logs}
      columns={[
        { title: "时间", dataIndex: "createdAt" },
        { title: "动作", dataIndex: "action" },
        { title: "对象", dataIndex: "targetType" },
        { title: "操作者", render: (_, record) => record.user?.name ?? "系统" },
      ]}
    />
  );
}
