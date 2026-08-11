import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Layout,
  Menu,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { API_BASE_URL } from "../config";

type ApiResult<T> = { data: T };

interface UserSummary {
  id: string;
  role: string;
  name: string;
  phone?: string;
  status?: string;
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
    parent: UserSummary;
  }>;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  steps: Array<{
    id: string;
    stepKey: string;
    name: string;
    timeRange: string;
    sortOrder: number;
    requirePhoto: boolean;
  }>;
}

const modules = [
  { key: "dashboard", label: "工作台" },
  { key: "teachers", label: "老师管理" },
  { key: "classes", label: "班级管理" },
  { key: "students", label: "学生管理" },
  { key: "workflow", label: "流程模板" },
  { key: "audit", label: "审计日志" },
];

export function App() {
  const [activeKey, setActiveKey] = useState("dashboard");
  const [token, setToken] = useState(() => localStorage.getItem("adminToken") ?? "");
  const [message, setMessage] = useState("");
  const [teachers, setTeachers] = useState<UserSummary[]>([]);
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const dashboard = useMemo(
    () => ({
      teachers: teachers.length,
      classes: classes.length,
      students: students.length,
      templates: templates.length,
    }),
    [classes.length, students.length, teachers.length, templates.length],
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
    const body = (await response.json()) as ApiResult<T> | { error: { message: string } };
    if (!response.ok) {
      throw new Error("error" in body ? body.error.message : "Request failed");
    }
    return (body as ApiResult<T>).data;
  }

  async function refreshAll() {
    if (!token) return;
    const [nextTeachers, nextClasses, nextStudents, nextTemplates, nextAuditLogs] =
      await Promise.all([
        request<UserSummary[]>("/admin/teachers"),
        request<ClassSummary[]>("/admin/classes"),
        request<StudentSummary[]>("/admin/students"),
        request<WorkflowTemplate[]>("/admin/workflow-templates"),
        request<any[]>("/admin/audit-logs"),
      ]);
    setTeachers(nextTeachers);
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
    }).then((response) => response.json() as Promise<ApiResult<{ token: string }>>);
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
          {message ? <Alert className="admin-alert" message={message} type="info" /> : null}
          {activeKey === "dashboard" ? (
            <Dashboard dashboard={dashboard} />
          ) : activeKey === "teachers" ? (
            <TeachersPanel teachers={teachers} request={request} refreshAll={refreshAll} />
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
              request={request}
              refreshAll={refreshAll}
            />
          ) : activeKey === "workflow" ? (
            <WorkflowPanel templates={templates} request={request} refreshAll={refreshAll} />
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
          <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="姓名" /></Form.Item>
          <Form.Item name="phone" rules={[{ required: true }]}><Input placeholder="手机号" /></Form.Item>
          <Button type="primary" htmlType="submit">创建</Button>
        </Form>
      </Card>
      <Table
        rowKey="id"
        dataSource={teachers}
        columns={[
          { title: "姓名", dataIndex: "name" },
          { title: "手机号", dataIndex: "phone" },
          { title: "状态", dataIndex: "status", render: (value) => <Tag>{value}</Tag> },
        ]}
      />
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
          <Form.Item name="campusId" rules={[{ required: true }]}><Input placeholder="校区 ID" /></Form.Item>
          <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="班级名" /></Form.Item>
          <Form.Item name="teacherId">
            <Select
              allowClear
              placeholder="老师"
              style={{ width: 180 }}
              options={teachers.map((teacher) => ({ label: teacher.name, value: teacher.id }))}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit">创建</Button>
        </Form>
      </Card>
      <Table
        rowKey="id"
        dataSource={classes}
        columns={[
          { title: "班级", dataIndex: "name" },
          { title: "校区", render: (_, record) => record.campus?.name ?? record.campusId },
          { title: "老师", render: (_, record) => record.teacher?.name ?? "未分配" },
          { title: "学生数", render: (_, record) => record._count?.students ?? 0 },
        ]}
      />
    </Space>
  );
}

function StudentsPanel({
  classes,
  students,
  request,
  refreshAll,
}: {
  classes: ClassSummary[];
  students: StudentSummary[];
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  refreshAll: () => Promise<void>;
}) {
  const [studentForm] = Form.useForm();
  const [guardianForm] = Form.useForm();
  return (
    <Space direction="vertical" size={16} className="admin-stack">
      <Card title="新增学生">
        <Form
          form={studentForm}
          layout="inline"
          onFinish={async (values) => {
            await request("/admin/students", {
              method: "POST",
              body: JSON.stringify({ ...values, status: "active" }),
            });
            studentForm.resetFields();
            await refreshAll();
          }}
        >
          <Form.Item name="classId" rules={[{ required: true }]}>
            <Select
              placeholder="班级"
              style={{ width: 180 }}
              options={classes.map((klass) => ({ label: klass.name, value: klass.id }))}
            />
          </Form.Item>
          <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="学生姓名" /></Form.Item>
          <Form.Item name="gender"><Input placeholder="性别" /></Form.Item>
          <Button type="primary" htmlType="submit">创建</Button>
        </Form>
      </Card>
      <Card title="绑定家长">
        <Form
          form={guardianForm}
          layout="inline"
          onFinish={async (values) => {
            const { studentId, ...body } = values;
            await request(`/admin/students/${studentId}/guardians`, {
              method: "POST",
              body: JSON.stringify(body),
            });
            guardianForm.resetFields();
            await refreshAll();
          }}
        >
          <Form.Item name="studentId" rules={[{ required: true }]}>
            <Select
              placeholder="学生"
              style={{ width: 180 }}
              options={students.map((student) => ({ label: student.name, value: student.id }))}
            />
          </Form.Item>
          <Form.Item name="parentName" rules={[{ required: true }]}><Input placeholder="家长姓名" /></Form.Item>
          <Form.Item name="parentPhone" rules={[{ required: true }]}><Input placeholder="家长手机号" /></Form.Item>
          <Form.Item name="relation" rules={[{ required: true }]}><Input placeholder="关系" /></Form.Item>
          <Button type="primary" htmlType="submit">绑定</Button>
        </Form>
      </Card>
      <Table
        rowKey="id"
        dataSource={students}
        columns={[
          { title: "学生", dataIndex: "name" },
          { title: "班级", render: (_, record) => record.class?.name ?? record.classId },
          { title: "状态", dataIndex: "status" },
          {
            title: "家长",
            render: (_, record) =>
              record.guardians?.map((item) => `${item.parent.name}(${item.relation})`).join("，") ?? "",
          },
        ]}
      />
    </Space>
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
  return (
    <Space direction="vertical" size={16} className="admin-stack">
      <Card title="创建默认流程模板">
        <Form
          form={form}
          layout="inline"
          initialValues={{ name: "托管一日流程" }}
          onFinish={async (values) => {
            await request("/admin/workflow-templates", {
              method: "POST",
              body: JSON.stringify({
                name: values.name,
                version: 1,
                isActive: true,
                steps: [
                  { stepKey: "arrive", name: "到校签到", timeRange: "16:30-17:00", sortOrder: 10 },
                  { stepKey: "homework", name: "作业辅导", timeRange: "17:00-18:20", sortOrder: 20 },
                  { stepKey: "leave", name: "离校交接", timeRange: "20:00-20:30", sortOrder: 30 },
                ],
              }),
            });
            await refreshAll();
          }}
        >
          <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="模板名" /></Form.Item>
          <Button type="primary" htmlType="submit">创建模板</Button>
        </Form>
      </Card>
      <Tabs
        items={templates.map((template) => ({
          key: template.id,
          label: template.name,
          children: (
            <Table
              rowKey="id"
              dataSource={template.steps}
              columns={[
                { title: "步骤", dataIndex: "name" },
                { title: "时间", dataIndex: "timeRange" },
                { title: "排序", dataIndex: "sortOrder" },
              ]}
            />
          ),
        }))}
      />
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
