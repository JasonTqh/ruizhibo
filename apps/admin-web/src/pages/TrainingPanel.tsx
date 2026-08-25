import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from "antd";
import { DeleteOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../config";

type RequestFn = <T>(path: string, options?: RequestInit) => Promise<T>;

interface Person {
  id: string;
  name: string;
  phone?: string;
  status?: string;
}

interface Campus {
  id: string;
  name: string;
}

interface TrainingPanelProps {
  request: RequestFn;
  token: string;
  teachers: Person[];
  campuses: Campus[];
  focusTeacherId?: string | null;
  onClearFocus?: () => void;
}

interface TrainingCapabilities {
  trainingManage: boolean;
  globalTrainingManage: boolean;
  courseManage: boolean;
  permissionManage: boolean;
  practicalConfirm: boolean;
  safetyConfirm: boolean;
  campusIds: string[];
}

const emptyCapabilities: TrainingCapabilities = {
  trainingManage: false,
  globalTrainingManage: false,
  courseManage: false,
  permissionManage: false,
  practicalConfirm: false,
  safetyConfirm: false,
  campusIds: [],
};

const assignmentLabels: Record<string, string> = {
  pending: "待开始",
  in_progress: "进行中",
  awaiting_safety: "待安全确认",
  completed: "已完成",
  frozen: "已冻结",
  terminated: "已终止",
};

const courseLabels: Record<string, string> = {
  locked: "未解锁",
  available: "可学习",
  in_progress: "学习中",
  awaiting_practical: "待实操确认",
  awaiting_safety: "待安全确认",
  completed: "已完成",
  exempted: "已免修",
};

const courseCategoryLabels: Record<string, string> = {
  foundation: "基础制度",
  business: "业务能力",
  safety: "安全",
  library: "资料库",
};

const assignmentTypeLabels: Record<string, string> = {
  onboarding: "入职培训",
  safety_retraining: "安全复训",
};

const attemptStatusLabels: Record<string, string> = {
  ...courseLabels,
  superseded: "已被新尝试替代",
};

const studyKindLabels: Record<string, string> = {
  content: "图文",
  video: "视频",
};

const permissionLabels: Record<string, string> = {
  training_manage: "培训管理",
  practical_confirm: "实操确认",
  safety_confirm: "安全确认",
};

const safetyLabels: Record<string, string> = {
  not_obtained: "未取得",
  awaiting_confirmation: "待确认",
  valid: "有效",
  expiring: "即将到期",
  retraining_required: "需复训",
};

const statDefinitions = [
  ["participants", "参训教师"],
  ["completed", "已完成人数"],
  ["learning", "学习中"],
  ["overdue", "已逾期"],
  ["pendingPractical", "待实操"],
  ["pendingSafety", "待安全确认"],
  ["safetyExpiring", "安全将到期"],
  ["safetyRetraining", "安全需复训"],
] as const;

const SAFETY_DECLARATION =
  "我已确认该教师完成全部安全培训内容，并同意其本次安全培训通过。";

export function TrainingPanel({
  request,
  token,
  teachers,
  campuses,
  focusTeacherId,
  onClearFocus,
}: TrainingPanelProps) {
  const [capabilities, setCapabilities] = useState<TrainingCapabilities>(emptyCapabilities);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignmentTotal, setAssignmentTotal] = useState(0);
  const [assignmentTeachers, setAssignmentTeachers] = useState<Person[]>([]);
  const [mentors, setMentors] = useState<Person[]>([]);
  const [trainingCampuses, setTrainingCampuses] = useState<Campus[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [practical, setPractical] = useState<any[]>([]);
  const [safety, setSafety] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [permissionSubjects, setPermissionSubjects] = useState<Person[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>(
    focusTeacherId ? { teacherId: focusTeacherId } : {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any | null>(null);
  const [courseDeleteTarget, setCourseDeleteTarget] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [practicalTarget, setPracticalTarget] = useState<any | null>(null);
  const [safetyTarget, setSafetyTarget] = useState<any | null>(null);
  const [actionTarget, setActionTarget] = useState<any | null>(null);
  const [flagTarget, setFlagTarget] = useState<any | null>(null);
  const [courseForm] = Form.useForm();

  const query = useMemo(() => {
    const values = new URLSearchParams({ page: "1", pageSize: "100" });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) values.set(key, value);
    });
    return values.toString();
  }, [filters]);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const nextCapabilities = await request<TrainingCapabilities>(
        "/admin/training/capabilities",
      );
      setCapabilities(nextCapabilities);
      const canReviewPractical =
        nextCapabilities.trainingManage || nextCapabilities.practicalConfirm;
      const [nextStats, list, nextSubjects, nextCourses, nextPractical, nextSafety, nextFeedback, nextFlags, nextPermissions, nextPermissionSubjects, nextAudits] =
        await Promise.all([
          nextCapabilities.trainingManage
            ? request<Record<string, number>>(`/admin/training/assignments/stats${filters.campusId ? `?campusId=${encodeURIComponent(filters.campusId)}` : ""}`)
            : Promise.resolve({}),
          nextCapabilities.trainingManage
            ? request<any>(`/admin/training/assignments?${query}`)
            : Promise.resolve({ items: [], total: 0 }),
          nextCapabilities.trainingManage
            ? request<any>("/admin/training/assignment-subjects")
            : Promise.resolve({ teachers: [], mentors: [], campuses: [] }),
          nextCapabilities.courseManage
            ? request<any[]>("/admin/training/courses")
            : Promise.resolve([]),
          canReviewPractical
            ? request<any[]>("/admin/training/practical/pending")
            : Promise.resolve([]),
          nextCapabilities.safetyConfirm
            ? request<any[]>("/admin/training/safety/pending")
            : Promise.resolve([]),
          nextCapabilities.trainingManage
            ? request<any>(`/admin/training/feedback?${query}`)
            : Promise.resolve({ items: [] }),
          nextCapabilities.trainingManage
            ? request<any[]>("/admin/training/feature-flags")
            : Promise.resolve([]),
          nextCapabilities.permissionManage
            ? request<any[]>("/admin/training/permissions")
            : Promise.resolve([]),
          nextCapabilities.permissionManage
            ? request<Person[]>("/admin/training/permission-subjects")
            : Promise.resolve([]),
          nextCapabilities.trainingManage
            ? request<any[]>("/admin/training/audit")
            : Promise.resolve([]),
        ]);
      setStats(nextStats);
      setAssignments(list.items);
      setAssignmentTotal(list.total);
      setAssignmentTeachers(nextSubjects.teachers);
      setMentors(nextSubjects.mentors);
      setTrainingCampuses(nextSubjects.campuses);
      setCourses(nextCourses);
      setPractical(nextPractical);
      setSafety(nextSafety);
      setFeedback(nextFeedback.items);
      setFlags(nextFlags);
      setPermissions(nextPermissions);
      setPermissionSubjects(nextPermissionSubjects);
      setAudits(nextAudits);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "培训数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [query]);

  useEffect(() => {
    if (focusTeacherId) setFilters({ teacherId: focusTeacherId });
  }, [focusTeacherId]);

  useEffect(() => {
    if (!focusTeacherId) return;
    const latest = assignments.find((item) => item.teacher?.id === focusTeacherId);
    if (latest) void loadDetail(latest.id);
  }, [focusTeacherId, assignments]);

  async function loadDetail(id: string) {
    try {
      setDetail(await request(`/admin/training/assignments/${id}`));
    } catch (cause) {
      Modal.error({ title: "详情加载失败", content: errorText(cause) });
    }
  }

  async function mutate(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      Modal.success({ title: success });
      setAssignOpen(false);
      setCourseOpen(false);
      setCourseDeleteTarget(null);
      setPracticalTarget(null);
      setSafetyTarget(null);
      setActionTarget(null);
      setFlagTarget(null);
      if (detail?.id) await loadDetail(detail.id).catch(() => undefined);
      await loadAll();
    } catch (cause) {
      Modal.error({ title: "操作失败", content: errorText(cause) });
      throw cause;
    }
  }

  function openNewCourse() {
    setEditingCourse(null);
    courseForm.setFieldsValue(defaultCourseValues());
    setCourseOpen(true);
  }

  function openCourse(course: any) {
    setEditingCourse(course);
    courseForm.setFieldsValue(courseFormValues(course));
    setCourseOpen(true);
  }

  async function submitCourse(values: any) {
    const payload = coursePayload(values);
    await mutate(
      () =>
        request(
          editingCourse
            ? `/admin/training/courses/${editingCourse.id}`
            : "/admin/training/courses",
          {
            method: editingCourse ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        ),
      editingCourse ? "课程已更新；既有任务仍使用原快照" : "课程已创建",
    );
  }

  async function download(path: string) {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("导出失败，请检查筛选条件和权限");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const matched = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const fileName = matched ? decodeURIComponent(matched[1]) : "教师培训.xlsx";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      Modal.error({ title: "导出失败", content: errorText(cause) });
    }
  }

  const assignmentColumns = [
    { title: "教师", dataIndex: ["teacher", "name"] },
    { title: "校区", dataIndex: ["campus", "name"] },
    { title: "轮次", dataIndex: "roundNumber", width: 72 },
    {
      title: "状态",
      dataIndex: "status",
      render: (value: string) => <Tag color={statusColor(value)}>{assignmentLabels[value] ?? value}</Tag>,
    },
    {
      title: "总进度",
      dataIndex: "progress",
      render: (value: any) => <Progress percent={value?.percent ?? 0} size="small" />,
    },
    { title: "截止日期", dataIndex: "dueAt", render: formatDate },
    {
      title: "期限",
      dataIndex: "deadlineStatus",
      render: (value: string) => (
        <Tag color={value === "overdue" ? "red" : value === "due_soon" ? "orange" : "green"}>
          {value === "overdue" ? "已逾期" : value === "due_soon" ? "即将到期" : "正常"}
        </Tag>
      ),
    },
    { title: "带教", dataIndex: ["mentor", "name"], render: (value: string) => value || "—" },
    {
      title: "操作",
      render: (_: unknown, item: any) => (
        <Button type="link" onClick={() => void loadDetail(item.id)}>详情</Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => void loadAll()}>重试</Button>} /> : null}
      {!loading && !Object.values(capabilities).some((value)=>value === true) ? <Alert type="warning" showIcon message="当前管理员尚未获得培训管理、实操确认或安全确认权限。" /> : null}
      {focusTeacherId && capabilities.trainingManage ? <Alert type="info" showIcon message={`教师培训详情：${teachers.find((teacher)=>teacher.id === focusTeacherId)?.name ?? "指定教师"}`} description={assignments.some((item)=>item.teacher?.id === focusTeacherId) ? "已按教师筛选，并自动打开其最近一轮培训；抽屉内可查看课程明细、历史轮次和审计记录。" : "该教师当前没有培训轮次。"} action={<Button onClick={()=>{setFilters({});setDetail(null);onClearFocus?.();}}>查看全部</Button>} /> : null}
      {capabilities.trainingManage ? <Row gutter={[12, 12]}>
        {statDefinitions.map(([key, label]) => (
          <Col xs={12} md={6} xl={3} key={key}>
            <Card size="small"><Statistic title={label} value={stats[key] ?? 0} /></Card>
          </Col>
        ))}
      </Row> : null}
      <Tabs
        items={([
          capabilities.trainingManage ? {
            key: "assignments",
            label: `培训任务（${assignmentTotal}）`,
            children: (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Card size="small">
                  <Form layout="inline" onFinish={(values) => setFilters({...cleanObject(values),...(focusTeacherId?{teacherId:focusTeacherId}:{})})}>
                    <Form.Item name="teacherName"><Input allowClear placeholder="教师姓名" /></Form.Item>
                    <Form.Item name="campusId"><Select allowClear placeholder="校区" style={{ width: 160 }} options={trainingCampuses.map(option)} /></Form.Item>
                    <Form.Item name="mentorId"><Select allowClear showSearch optionFilterProp="label" placeholder="带教负责人" style={{ width: 160 }} options={mentors.map(option)} /></Form.Item>
                    <Form.Item name="status"><Select allowClear placeholder="培训状态" style={{ width: 150 }} options={Object.entries(assignmentLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
                    <Form.Item name="safetyStatus"><Select allowClear placeholder="安全状态" style={{ width: 150 }} options={Object.entries(safetyLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
                    <Form.Item name="deadlineStatus"><Select allowClear placeholder="期限状态" style={{ width: 140 }} options={[{value:"normal",label:"正常"},{value:"due_soon",label:"即将到期"},{value:"overdue",label:"已逾期"}]} /></Form.Item>
                    <Form.Item><Button htmlType="submit">筛选</Button></Form.Item>
                    <Form.Item><Button type="primary" onClick={() => setAssignOpen(true)}>布置培训</Button></Form.Item>
                    <Form.Item><Button onClick={() => void download(`/admin/training/assignments-export.xlsx?${query}`)}>导出当前任务</Button></Form.Item>
                    <Form.Item><Button onClick={() => void download(`/admin/training/assignments-export.xlsx?${query}&includeHistory=true`)}>导出历史轮次</Button></Form.Item>
                  </Form>
                </Card>
                <Table rowKey="id" loading={loading} dataSource={assignments} columns={assignmentColumns} pagination={false} scroll={{ x: 1100 }} />
              </Space>
            ),
          } : null,
          capabilities.courseManage ? {
            key: "courses",
            label: `课程维护（${courses.length}）`,
            children: (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Alert type="info" showIcon message="课程保存后只影响新布置任务；进行中和历史任务继续使用布置时快照。" />
                <Button type="primary" onClick={openNewCourse}>新增资料库课程</Button>
                <Table rowKey="id" dataSource={courses} pagination={false} columns={[
                  {title:"顺序",dataIndex:"sortOrder",width:70},
                  {title:"课程",dataIndex:"name"},
                  {title:"代码",dataIndex:"code"},
                  {title:"分类",dataIndex:"category",render:(v:string)=>courseCategoryLabels[v] ?? v},
                  {title:"最低时长",dataIndex:"minimumMinutes",render:(v:number)=>`${v} 分钟`},
                  {title:"实操",dataIndex:"requiresPractical",render:(v:boolean)=>v?"需要":"不需要"},
                  {title:"状态",dataIndex:"status",render:(v:string)=><Tag>{v === "enabled" ? "已启用" : v === "draft" ? "草稿" : "已停用"}</Tag>},
                  {title:"操作",render:(_:unknown,item:any)=><Space><Button type="link" onClick={()=>openCourse(item)}>编辑</Button>{item.status === "draft" ? <Button danger type="link" onClick={()=>setCourseDeleteTarget(item)}>删除</Button>:null}</Space>},
                ]} />
              </Space>
            ),
          } : null,
          capabilities.practicalConfirm || capabilities.safetyConfirm ? {
            key: "todos",
            label: `确认待办（${practical.length + safety.length}）`,
            children: <TodoPanels practical={practical} safety={safety} showPractical={capabilities.practicalConfirm} showSafety={capabilities.safetyConfirm} onPractical={setPracticalTarget} onSafety={setSafetyTarget} />,
          } : null,
          capabilities.trainingManage ? {
            key: "feedback",
            label: `培训反馈（${feedback.length}）`,
            children: (
              <Space direction="vertical" style={{ width: "100%" }}>
                <Button onClick={() => void download(`/admin/training/feedback-export.xlsx?${query}`)}>导出反馈 Excel</Button>
                <Table rowKey="id" dataSource={feedback} pagination={false} columns={[
                  {title:"教师",dataIndex:["teacher","name"]},
                  {title:"校区",dataIndex:["assignment","campus","name"]},
                  {title:"评分",dataIndex:"rating",render:(v:number)=>`${v}/5`},
                  {title:"培训感悟",dataIndex:"reflection",render:empty},
                  {title:"改进建议",dataIndex:"suggestion",render:empty},
                  {title:"提交时间",dataIndex:"submittedAt",render:formatDate},
                ]} />
              </Space>
            ),
          } : null,
          capabilities.trainingManage ? {
            key: "settings",
            label: "权限与灰度",
            children: <SettingsPanel flags={flags} permissions={permissions} permissionSubjects={permissionSubjects} campuses={trainingCampuses} request={request} onFlag={setFlagTarget} onSaved={loadAll} canManagePermissions={capabilities.permissionManage} />,
          } : null,
          capabilities.trainingManage ? {
            key: "audit",
            label: "培训审计",
            children: <Table rowKey="id" dataSource={audits} pagination={{ pageSize: 20 }} scroll={{x:1500}} columns={[
              {title:"时间",dataIndex:"createdAt",render:formatDate},
              {title:"操作人",dataIndex:["actor","name"],render:empty},
              {title:"校区",dataIndex:"campusId",render:empty},
              {title:"培训轮次",dataIndex:"assignmentId",render:empty},
              {title:"动作",dataIndex:"action"},
              {title:"对象",dataIndex:"targetType"},
              {title:"原因",dataIndex:"reason",render:empty},
              {title:"操作前",dataIndex:"before",render:jsonBrief},
              {title:"操作后",dataIndex:"after",render:jsonBrief},
            ]} />,
          } : null,
        ]).filter(Boolean) as any}
      />

      <AssignModal open={assignOpen} teachers={assignmentTeachers} mentors={mentors} campuses={trainingCampuses} onCancel={() => setAssignOpen(false)} onSubmit={(values: any) => mutate(() => request("/admin/training/assignments", {method:"POST",body:JSON.stringify(normalizeAssignment(values))}), "培训任务已布置")} />
      <CourseModal open={courseOpen} form={courseForm} token={token} editing={editingCourse} onCancel={() => setCourseOpen(false)} onSubmit={submitCourse} />
      <ReasonModal target={courseDeleteTarget} title={`删除草稿课程：${courseDeleteTarget?.name ?? ""}`} onCancel={() => setCourseDeleteTarget(null)} onSubmit={(values: any) => mutate(() => request(`/admin/training/courses/${courseDeleteTarget.id}`, {method:"DELETE",body:JSON.stringify({reason:values.reason})}), "草稿已删除")} />
      <AssignmentDrawer detail={detail} canRevokeSafety={capabilities.safetyConfirm} onClose={() => setDetail(null)} onAction={setActionTarget} onOpenHistory={loadDetail} />
      <PracticalModal target={practicalTarget} onCancel={() => setPracticalTarget(null)} onSubmit={(values: any) => mutate(() => request(`/admin/training/practical/${practicalTarget.id}`, {method:"POST",body:JSON.stringify(practicalPayload(practicalTarget,values))}), "实操检查已记录")} />
      <SafetyModal target={safetyTarget} onCancel={() => setSafetyTarget(null)} onSubmit={(values: any) => mutate(() => request(`/admin/training/safety/${safetyTarget.id}/confirm`, {method:"POST",body:JSON.stringify({...values,declaration:SAFETY_DECLARATION})}), "安全培训已确认")} />
      <ActionModal target={actionTarget} onCancel={() => setActionTarget(null)} onSubmit={(values: any) => mutate(() => performAction(request, actionTarget, values), "操作已完成并记入审计")} />
      <ReasonModal target={flagTarget} title={`${flagTarget?.campus?.name ?? "校区"}：${flagTarget?.enabled ? "关闭" : "启用"}教师学院`} onCancel={() => setFlagTarget(null)} onSubmit={(values: any) => mutate(() => request(`/admin/training/feature-flags/${flagTarget.campus.id}`, {method:"PATCH",body:JSON.stringify({enabled:!flagTarget.enabled,reason:values.reason})}), "校区开关已更新")} />
    </Space>
  );
}

function AssignModal({ open, teachers, mentors, campuses, onCancel, onSubmit }: any) {
  const [form] = Form.useForm();
  return (
    <Modal title="布置新教师培训" open={open} onCancel={onCancel} onOk={() => form.submit()} okText="确认布置" cancelText="取消" width={680} destroyOnHidden>
      <Alert type="info" showIcon message="固定布置 7 门必修课，默认截止日期为 7 个自然日；每位教师同时只能有一个有效任务。" style={{marginBottom:16}} />
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="teacherIds" label="参训教师" rules={[{required:true}]}><Select mode="multiple" showSearch optionFilterProp="label" options={teachers.filter((x:any)=>x.status === "active").map(option)} /></Form.Item>
        <Form.Item name="campusId" label="培训校区" rules={[{required:true}]}><Select options={campuses.map(option)} /></Form.Item>
        <Form.Item name="mentorId" label="带教负责人" rules={[{required:true}]}><Select showSearch optionFilterProp="label" options={mentors.filter((x:any)=>x.status === "active").map(option)} /></Form.Item>
        <Form.Item name="dueAt" label="截止日期（不填则自动计算 7 天）"><Input type="datetime-local" /></Form.Item>
        <Form.Item name="reason" label="布置原因（永久审计）" rules={[{required:true,min:2,max:1000}]}><Input.TextArea rows={3} /></Form.Item>
      </Form>
    </Modal>
  );
}

function CourseModal({ open, form, token, editing, onCancel, onSubmit }: any) {
  return (
    <Modal title={editing ? `编辑课程：${editing.name}` : "新增课程"} open={open} onCancel={onCancel} onOk={() => form.submit()} okText="保存课程" cancelText="取消" width={1050} destroyOnHidden forceRender>
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Row gutter={12}>
          <Col span={8}><Form.Item name="code" label="课程代码" rules={[{required:true}]}><Input disabled={Boolean(editing)} /></Form.Item></Col>
          <Col span={8}><Form.Item name="name" label="课程名称" rules={[{required:true}]}><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="category" label="分类" rules={[{required:true}]}><Select options={[{value:"foundation",label:"基础制度"},{value:"business",label:"业务能力"},{value:"safety",label:"安全"},{value:"library",label:"资料库"}]} /></Form.Item></Col>
        </Row>
        <Form.Item name="summary" label="课程简介" rules={[{required:true}]}><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="audience" label="适用对象"><Input /></Form.Item>
        <Row gutter={12}>
          <Col span={4}><Form.Item name="expectedMinutes" label="预计分钟" rules={[{required:true}]}><InputNumber min={0} /></Form.Item></Col>
          <Col span={4}><Form.Item name="minimumMinutes" label="最低分钟" rules={[{required:true}]}><InputNumber min={0} /></Form.Item></Col>
          <Col span={4}><Form.Item name="sortOrder" label="排序" rules={[{required:true}]}><InputNumber min={1} /></Form.Item></Col>
          <Col span={4}><Form.Item name="isRequired" label="必修" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={4}><Form.Item name="requiresPractical" label="需要实操" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={4}><Form.Item name="isSafety" label="安全课程" valuePropName="checked"><Switch /></Form.Item></Col>
        </Row>
        <Form.Item name="status" label="内容状态" rules={[{required:true}]}><Select options={[{value:"draft",label:"草稿"},{value:"enabled",label:"已启用"},{value:"disabled",label:"已停用"}]} /></Form.Item>
        <Form.Item name="reason" label="维护原因（永久审计）" rules={[{required:true,min:2,max:1000}]}><Input.TextArea rows={3} placeholder="说明新增、修改或启停课程的原因" /></Form.Item>

        <Typography.Title level={5}>章节与媒体</Typography.Title>
        <Form.List name="chapters">
          {(fields, { add, remove }) => <Space direction="vertical" style={{width:"100%"}}>
            {fields.map((field, index) => (
              <Card key={field.key} size="small" title={`章节 ${index + 1}`} extra={<Button danger type="text" icon={<DeleteOutlined />} onClick={()=>remove(field.name)} />}>
                <Row gutter={12}>
                  <Col span={16}><Form.Item name={[field.name,"title"]} label="标题" rules={[{required:true}]}><Input /></Form.Item></Col>
                  <Col span={4}><Form.Item name={[field.name,"sortOrder"]} label="排序" rules={[{required:true}]}><InputNumber min={1} /></Form.Item></Col>
                  <Col span={4}><Form.Item name={[field.name,"isEnabled"]} label="启用" valuePropName="checked"><Switch /></Form.Item></Col>
                </Row>
                <Form.Item name={[field.name,"contentHtml"]} label="图文内容（支持安全 HTML）" rules={[{required:true}]}><Input.TextArea rows={5} /></Form.Item>
                <Form.List name={[field.name,"media"]}>
                  {(mediaFields,{add:addMedia,remove:removeMedia}) => <Space direction="vertical" style={{width:"100%"}}>
                    {mediaFields.map((mediaField,mediaIndex)=><Row gutter={8} key={mediaField.key} align="middle">
                      <Col span={8}><Form.Item name={[mediaField.name,"fileAssetId"]} label="素材ID" rules={[{required:true}]}><Input readOnly /></Form.Item></Col>
                      <Col span={4}><Form.Item name={[mediaField.name,"type"]} label="类型"><Select options={[{value:"image",label:"图片"},{value:"video",label:"MP4"}]} /></Form.Item></Col>
                      <Col span={5}><Form.Item name={[mediaField.name,"caption"]} label="说明"><Input /></Form.Item></Col>
                      <Col span={3}><Form.Item name={[mediaField.name,"durationSeconds"]} label="视频秒数（MP4必填）"><InputNumber min={1} /></Form.Item></Col>
                      <Col span={2}><Form.Item name={[mediaField.name,"sortOrder"]} label="排序"><InputNumber min={1} /></Form.Item></Col>
                      <Col span={2}><Button danger type="text" icon={<DeleteOutlined />} onClick={()=>removeMedia(mediaField.name)} /></Col>
                    </Row>)}
                    <TrainingUpload token={token} onUploaded={(asset:any)=>addMedia({fileAssetId:asset.id,type:asset.mimeType === "video/mp4"?"video":"image",caption:"",durationSeconds:undefined,sortOrder:mediaFields.length+1})} />
                  </Space>}
                </Form.List>
              </Card>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} onClick={()=>add({title:"",contentHtml:"<p></p>",sortOrder:fields.length+1,isEnabled:true,media:[]})}>添加章节</Button>
          </Space>}
        </Form.List>

        <Typography.Title level={5} style={{marginTop:20}}>测验</Typography.Title>
        <Row gutter={12}>
          <Col span={6}><Form.Item name={["quiz","passScore"]} label="及格分"><InputNumber min={0} max={100} /></Form.Item></Col>
          <Col span={6}><Form.Item name={["quiz","maxAttempts"]} label="最大次数（留空不限）"><InputNumber min={1} /></Form.Item></Col>
        </Row>
        <Form.List name={["quiz","questions"]}>
          {(fields,{add,remove})=><Space direction="vertical" style={{width:"100%"}}>
            {fields.map((field,index)=><Card size="small" key={field.key} title={`题目 ${index+1}`} extra={<Button danger type="text" onClick={()=>remove(field.name)}>删除</Button>}>
              <Row gutter={8}>
                <Col span={5}><Form.Item name={[field.name,"type"]} label="题型"><Select options={[{value:"single_choice",label:"单选"},{value:"multiple_choice",label:"多选"},{value:"true_false",label:"判断"}]} /></Form.Item></Col>
                <Col span={15}><Form.Item name={[field.name,"prompt"]} label="题干" rules={[{required:true}]}><Input /></Form.Item></Col>
                <Col span={4}><Form.Item name={[field.name,"score"]} label="分值"><InputNumber min={1} /></Form.Item></Col>
              </Row>
              <Form.Item name={[field.name,"optionsText"]} label="选项（每行“标识|内容”）" rules={[{required:true}]}><Input.TextArea rows={3} placeholder={"A|选项一\nB|选项二"} /></Form.Item>
              <Form.Item name={[field.name,"correctAnswersText"]} label="正确答案标识（多个用逗号分隔）" rules={[{required:true}]}><Input /></Form.Item>
              <Form.Item name={[field.name,"explanation"]} label="解析"><Input.TextArea rows={2} /></Form.Item>
              <Form.Item name={[field.name,"sortOrder"]} hidden><InputNumber /></Form.Item>
            </Card>)}
            <Button type="dashed" onClick={()=>add(defaultQuestion(fields.length+1))}>添加题目</Button>
          </Space>}
        </Form.List>

        <Typography.Title level={5} style={{marginTop:20}}>实操检查清单</Typography.Title>
        <Form.List name="practicalItems">
          {(fields,{add,remove})=><Space direction="vertical" style={{width:"100%"}}>
            {fields.map((field,index)=><Row gutter={8} key={field.key}>
              <Col span={10}><Form.Item name={[field.name,"title"]} label={`项目 ${index+1}`}><Input /></Form.Item></Col>
              <Col span={9}><Form.Item name={[field.name,"instructions"]} label="检查说明"><Input /></Form.Item></Col>
              <Col span={2}><Form.Item name={[field.name,"isRequired"]} label="必填" valuePropName="checked"><Switch /></Form.Item></Col>
              <Col span={2}><Form.Item name={[field.name,"sortOrder"]} label="排序"><InputNumber min={1} /></Form.Item></Col>
              <Col span={1}><Button danger type="text" icon={<DeleteOutlined />} onClick={()=>remove(field.name)} /></Col>
            </Row>)}
            <Button type="dashed" onClick={()=>add({title:"",instructions:"",isRequired:true,sortOrder:fields.length+1})}>添加实操项目</Button>
          </Space>}
        </Form.List>
      </Form>
    </Modal>
  );
}

function TrainingUpload({ token, onUploaded }: any) {
  return (
    <Upload showUploadList={false} accept=".jpg,.jpeg,.png,.webp,.mp4" customRequest={async ({file,onSuccess,onError}:any)=>{
      try {
        const body = new FormData();
        body.append("file",file);
        const response = await fetch(`${API_BASE_URL}/files/training`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body});
        const result = await response.json();
        if(!response.ok) throw new Error(result.error?.message || result.message || "上传失败");
        onUploaded(result.data);
        onSuccess?.(result.data);
      } catch(cause) {
        Modal.error({title:"素材上传失败",content:errorText(cause)});
        onError?.(cause);
      }
    }}>
      <Button icon={<UploadOutlined />}>上传图片或 H.264/AAC MP4</Button>
    </Upload>
  );
}

function AssignmentDrawer({ detail, canRevokeSafety, onClose, onAction, onOpenHistory }: any) {
  return (
    <Drawer title={detail ? `${detail.teacher.name} · 第 ${detail.roundNumber} 轮培训` : "培训详情"} open={Boolean(detail)} onClose={onClose} width={860}>
      {detail ? <Space direction="vertical" style={{width:"100%"}} size={16}>
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="校区">{detail.campus.name}</Descriptions.Item>
          <Descriptions.Item label="状态">{assignmentLabels[detail.status]}</Descriptions.Item>
          <Descriptions.Item label="带教负责人">{detail.mentor?.name ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="截止日期">{formatDate(detail.dueAt)}</Descriptions.Item>
          <Descriptions.Item label="总进度"><Progress percent={detail.progress.percent} size="small" /></Descriptions.Item>
          <Descriptions.Item label="反馈">{detail.feedback ? `${detail.feedback.rating}/5` : "尚未提交（不影响完成）"}</Descriptions.Item>
          {detail.feedback ? <Descriptions.Item label="培训感悟" span={2}>{detail.feedback.reflection || "—"}</Descriptions.Item> : null}
          {detail.feedback ? <Descriptions.Item label="改进建议" span={2}>{detail.feedback.suggestion || "—"}</Descriptions.Item> : null}
        </Descriptions>
        <Space>
          {!['completed','terminated'].includes(detail.status) ? <Button onClick={()=>onAction({kind:"due",assignment:detail})}>修改截止日期</Button>:null}
          {!['completed','terminated'].includes(detail.status) ? <Button danger onClick={()=>onAction({kind:"terminate",assignment:detail})}>终止任务</Button>:null}
          {canRevokeSafety && detail.status === "completed" && detail.courses.some((x:any)=>x.snapshot.isSafety) ? <Button danger onClick={()=>onAction({kind:"revokeSafety",assignment:detail})}>撤销安全确认</Button>:null}
        </Space>
        <Table rowKey="id" dataSource={detail.courses} pagination={false} expandable={{expandedRowRender:(course:any)=><AttemptHistory course={course} />}} columns={[
          {title:"顺序",dataIndex:"sortOrder",width:65},
          {title:"课程",dataIndex:["snapshot","courseName"]},
          {title:"状态",dataIndex:"status",render:(v:string)=><Tag>{courseLabels[v] ?? v}</Tag>},
          {title:"最近学习",dataIndex:"lastLearningAt",render:formatDate},
          {title:"操作",render:(_:unknown,course:any)=><Space>{['locked','available','in_progress','awaiting_practical'].includes(course.status) && !course.snapshot.isSafety ? <Button type="link" onClick={()=>onAction({kind:"exempt",assignment:detail,course})}>免修</Button>:null}{['completed','exempted'].includes(course.status)?<Button type="link" onClick={()=>onAction({kind:"relearn",assignment:detail,course})}>单门重学</Button>:null}</Space>},
        ]} />
        <Typography.Title level={5}>安全确认与撤销记录</Typography.Title>
        <Table rowKey="id" size="small" dataSource={detail.safetyRecords} pagination={false} scroll={{x:1000}} columns={safetyRecordColumns()} />
        <Typography.Title level={5}>历史轮次</Typography.Title>
        <Table rowKey="id" dataSource={detail.history} pagination={false} columns={[
          {title:"轮次",dataIndex:"roundNumber"},{title:"类型",dataIndex:"type",render:(v:string)=>assignmentTypeLabels[v] ?? v},{title:"状态",dataIndex:"status",render:(v:string)=>assignmentLabels[v] ?? v},{title:"布置时间",dataIndex:"assignedAt",render:formatDate},{title:"截止时间",dataIndex:"dueAt",render:formatDate},{title:"操作",render:(_:unknown,item:any)=><Button type="link" onClick={()=>void onOpenHistory(item.id)}>查看详情</Button>},
        ]} />
        <Typography.Title level={5}>本轮审计</Typography.Title>
        <Table rowKey="id" dataSource={detail.auditRecords} pagination={false} scroll={{x:1200}} columns={auditColumns()} />
      </Space>:null}
    </Drawer>
  );
}

function AttemptHistory({ course }: any) {
  return <Table rowKey="id" size="small" dataSource={course.attempts} pagination={false} expandable={{expandedRowRender:(attempt:any)=><AttemptDetail course={course} attempt={attempt} />}} columns={[
    {title:"尝试",dataIndex:"attemptNumber"},{title:"状态",dataIndex:"status",render:(v:string)=>attemptStatusLabels[v] ?? v},{title:"学习时长",dataIndex:"accumulatedSeconds",render:(v:number)=>`${Math.floor(v/60)} 分 ${v%60} 秒`},{title:"测验次数",dataIndex:"quizAttempts",render:(v:any[])=>v.length},{title:"实操记录",dataIndex:"practicalChecks",render:(v:any[])=>v.length},{title:"完成时间",dataIndex:"completedAt",render:formatDate},
  ]} />;
}

function AttemptDetail({ course, attempt }: any) {
  const chapters = course.snapshot.payload?.chapters ?? [];
  const progressByKey = new Map((attempt.chapterProgress ?? []).map((item:any)=>[item.chapterKey,item]));
  const chapterRows = chapters.map((chapter:any)=>({chapter,...(progressByKey.get(chapter.key) ?? {})}));
  return <Space direction="vertical" style={{width:"100%"}} size={12}>
    <Typography.Text strong>章节完成与视频进度</Typography.Text>
    <Table rowKey={(item:any)=>item.chapter.key} size="small" dataSource={chapterRows} pagination={false} columns={[
      {title:"章节",dataIndex:["chapter","title"]},{title:"完成时间",dataIndex:"completedAt",render:formatDate},{title:"续播位置",dataIndex:"videoPositionSeconds",render:(v:number)=>v?`${Math.floor(v)} 秒`:"—"},{title:"有效观看",dataIndex:"watchedPercent",render:(v:number)=>v===undefined?"—":`${Math.round(v)}%`},
    ]} />
    <Typography.Text strong>学习会话</Typography.Text>
    <Table rowKey="id" size="small" dataSource={attempt.studySessions ?? []} pagination={false} columns={[
      {title:"章节标识",dataIndex:"chapterKey"},{title:"类型",dataIndex:"kind",render:(v:string)=>studyKindLabels[v] ?? v},{title:"开始",dataIndex:"startedAt",render:formatDate},{title:"结束",dataIndex:"endedAt",render:formatDate},{title:"有效时长",dataIndex:"accumulatedSeconds",render:(v:number)=>`${v ?? 0} 秒`},
    ]} />
    <Typography.Text strong>测验记录</Typography.Text>
    <Table rowKey="id" size="small" dataSource={attempt.quizAttempts ?? []} pagination={false} columns={[
      {title:"次数",dataIndex:"attemptNumber"},{title:"分数",dataIndex:"score"},{title:"结果",dataIndex:"passed",render:(v:boolean)=><Tag color={v?"green":"red"}>{v?"通过":"未通过"}</Tag>},{title:"提交时间",dataIndex:"submittedAt",render:formatDate},
    ]} />
    <Typography.Text strong>实操检查记录</Typography.Text>
    <Table rowKey="id" size="small" dataSource={attempt.practicalChecks ?? []} pagination={false} scroll={{x:900}} columns={[
      {title:"确认人",dataIndex:["reviewer","name"],render:empty},{title:"结论",dataIndex:"conclusion",render:(v:string)=>v === "passed"?"通过":"需复训"},{title:"检查清单",dataIndex:"checklistResults",render:(v:any[])=>practicalChecklistText(v,course.snapshot.payload?.practicalItems ?? [])},{title:"评语",dataIndex:"comment"},{title:"时间",dataIndex:"createdAt",render:formatDate},
    ]} />
    <Typography.Text strong>安全责任记录</Typography.Text>
    <Table rowKey="id" size="small" dataSource={attempt.safetyRecords ?? []} pagination={false} scroll={{x:1000}} columns={safetyRecordColumns()} />
  </Space>;
}

function TodoPanels({ practical, safety, showPractical, showSafety, onPractical, onSafety }: any) {
  return <Space direction="vertical" style={{width:"100%"}} size={16}>
    {showPractical ? <Card title={`待实操确认（${practical.length}）`}><Table rowKey="id" dataSource={practical} pagination={false} columns={[
      {title:"教师",dataIndex:["assignment","teacher","name"]},{title:"校区",dataIndex:["assignment","campus","name"]},{title:"课程",dataIndex:["snapshot","courseName"]},{title:"带教负责人",dataIndex:["assignment","mentor","name"],render:empty},{title:"操作",render:(_:unknown,item:any)=><Button type="primary" onClick={()=>onPractical(item)}>填写检查</Button>},
    ]} /></Card> : null}
    {showSafety ? <Card title={`待安全确认（${safety.length}）`}><Table rowKey="id" dataSource={safety} pagination={false} columns={[
      {title:"教师",dataIndex:["teacher","name"]},{title:"校区",dataIndex:["campus","name"]},{title:"带教负责人",dataIndex:["mentor","name"],render:empty},{title:"操作",render:(_:unknown,item:any)=><Button danger type="primary" onClick={()=>onSafety(item)}>安全确认</Button>},
    ]} /></Card> : null}
  </Space>;
}

function PracticalModal({ target, onCancel, onSubmit }: any) {
  const [form] = Form.useForm();
  const items = target?.snapshot?.payload?.practicalItems ?? [];
  return <Modal title={target ? `${target.assignment.teacher.name} · ${target.snapshot.courseName}`:"实操确认"} open={Boolean(target)} onCancel={onCancel} onOk={()=>form.submit()} okText="提交检查" cancelText="取消" destroyOnHidden>
    <Form form={form} layout="vertical" onFinish={onSubmit} initialValues={{conclusion:"passed",checks:Object.fromEntries(items.map((x:any)=>[x.id,true]))}}>
      {items.map((item:any)=><Form.Item key={item.id} name={["checks",item.id]} valuePropName="checked" label={item.title} extra={item.instructions}><Switch checkedChildren="通过" unCheckedChildren="未通过" /></Form.Item>)}
      <Form.Item name="conclusion" label="总体结论" rules={[{required:true}]}><Select options={[{value:"passed",label:"通过"},{value:"retraining_required",label:"需复训"}]} /></Form.Item>
      <Form.Item name="comment" label="检查评语" rules={[{required:true,min:1}]}><Input.TextArea rows={3} /></Form.Item>
    </Form>
  </Modal>;
}

function SafetyModal({ target, onCancel, onSubmit }: any) {
  const [form] = Form.useForm();
  return <Modal title={target ? `${target.teacher.name} · 安全培训最终确认`:"安全培训确认"} open={Boolean(target)} onCancel={onCancel} onOk={()=>form.submit()} okText="确认通过" cancelText="取消" width={780} destroyOnHidden okButtonProps={{danger:true}}>
    <Alert type="warning" showIcon message="该操作将产生 6 个月有效的安全培训凭证，并永久保留责任记录。" style={{marginBottom:16}} />
    <Table size="small" rowKey="id" dataSource={target?.courses ?? []} pagination={false} style={{marginBottom:16}} columns={[
      {title:"课程",dataIndex:["snapshot","courseName"]},
      {title:"状态",dataIndex:"status",render:(value:string)=>courseLabels[value] ?? value},
      {title:"最近测验",render:(_:unknown,item:any)=>{const quiz=item.attempts?.[0]?.quizAttempts?.[0];return quiz?`${quiz.score} 分 / ${quiz.passed?"通过":"未通过"}`:"—";}},
      {title:"最近实操",render:(_:unknown,item:any)=>{const check=item.attempts?.[0]?.practicalChecks?.[0];return check?(check.conclusion === "passed"?"通过":"需复训"):"—";}},
    ]} />
    <Form form={form} layout="vertical" onFinish={onSubmit}>
      <Form.Item name="declarationAccepted" valuePropName="checked" rules={[{validator:(_,v)=>v?Promise.resolve():Promise.reject(new Error("必须勾选责任声明"))}]}><Checkbox>{SAFETY_DECLARATION}</Checkbox></Form.Item>
      <Form.Item name="note" label="备注"><Input.TextArea rows={3} /></Form.Item>
    </Form>
  </Modal>;
}

function ActionModal({ target, onCancel, onSubmit }: any) {
  const [form] = Form.useForm();
  const title = target?.kind === "due" ? "修改截止日期" : target?.kind === "terminate" ? "终止培训任务" : target?.kind === "exempt" ? "课程免修" : target?.kind === "relearn" ? "单门重学" : "撤销安全确认";
  return <Modal title={title} open={Boolean(target)} onCancel={onCancel} onOk={()=>form.submit()} okText="确认操作" cancelText="取消" destroyOnHidden okButtonProps={{danger:target?.kind !== "due"}}>
    <Form form={form} layout="vertical" onFinish={onSubmit}>
      {target?.kind === "due" ? <Form.Item name="dueAt" label="新截止日期" rules={[{required:true}]}><Input type="datetime-local" /></Form.Item>:null}
      <Form.Item name="reason" label="操作原因（永久保留）" rules={[{required:true,min:2}]}><Input.TextArea rows={4} /></Form.Item>
    </Form>
  </Modal>;
}

function ReasonModal({ target, title, onCancel, onSubmit }: any) {
  const [form] = Form.useForm();
  return <Modal title={title} open={Boolean(target)} onCancel={onCancel} onOk={()=>form.submit()} okText="确认" cancelText="取消" destroyOnHidden><Form form={form} layout="vertical" onFinish={onSubmit}><Form.Item name="reason" label="原因" rules={[{required:true,min:2}]}><Input.TextArea rows={3} /></Form.Item></Form></Modal>;
}

function SettingsPanel({ flags, permissions, permissionSubjects, campuses, request, onFlag, onSaved, canManagePermissions }: any) {
  const [form] = Form.useForm();
  return <Space direction="vertical" style={{width:"100%"}} size={16}>
    <Card title="校区灰度开关"><Alert type="info" showIcon message="关闭后隐藏并阻止该校区培训入口，不删除任何学习与审计数据；重新启用后可继续。" style={{marginBottom:12}} /><Table rowKey={(x:any)=>x.campus.id} dataSource={flags} pagination={false} columns={[
      {title:"校区",dataIndex:["campus","name"]},{title:"状态",dataIndex:"enabled",render:(v:boolean)=><Tag color={v?"green":"default"}>{v?"已启用":"已关闭"}</Tag>},{title:"最近原因",dataIndex:"reason"},{title:"更新时间",dataIndex:"updatedAt",render:formatDate},{title:"操作",render:(_:unknown,item:any)=><Button danger={item.enabled} onClick={()=>onFlag(item)}>{item.enabled?"关闭入口":"启用入口"}</Button>},
    ]} /></Card>
    {canManagePermissions ? <Card title="培训权限授权">
      <Form form={form} layout="inline" onFinish={async(values)=>{try{await request("/admin/training/permissions",{method:"PATCH",body:JSON.stringify(values)});form.resetFields();await onSaved();Modal.success({title:"权限已更新"});}catch(cause){Modal.error({title:"授权失败",content:errorText(cause)})}}}>
        <Form.Item name="userId" rules={[{required:true}]}><Select placeholder="管理员账号" style={{width:170}} options={permissionSubjects.map(option)} /></Form.Item>
        <Form.Item name="campusId"><Select allowClear placeholder="全局范围" style={{width:150}} options={campuses.map(option)} /></Form.Item>
        <Form.Item name="permission" rules={[{required:true}]}><Select placeholder="权限" style={{width:170}} options={[{value:"training_manage",label:"培训管理"},{value:"practical_confirm",label:"实操确认"},{value:"safety_confirm",label:"安全确认"}]} /></Form.Item>
        <Form.Item name="isActive" valuePropName="checked" initialValue><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
        <Form.Item name="reason" rules={[{required:true,min:2}]}><Input placeholder="授权原因" /></Form.Item>
        <Button htmlType="submit" type="primary">保存</Button>
      </Form>
      <Table style={{marginTop:16}} rowKey="id" dataSource={permissions} pagination={{pageSize:10}} columns={[
        {title:"账号",dataIndex:["user","name"]},{title:"权限",dataIndex:"permission",render:(v:string)=>permissionLabels[v] ?? v},{title:"范围",render:(_:unknown,x:any)=>x.campus?.name ?? "总部/全局"},{title:"状态",dataIndex:"isActive",render:(v:boolean)=>v?"启用":"停用"},{title:"授权时间",dataIndex:"updatedAt",render:formatDate},
      ]} />
    </Card> : null}
  </Space>;
}

function performAction(request: RequestFn, target: any, values: any) {
  if (target.kind === "due") return request(`/admin/training/assignments/${target.assignment.id}/due-date`,{method:"PATCH",body:JSON.stringify({dueAt:new Date(values.dueAt).toISOString(),reason:values.reason})});
  if (target.kind === "terminate") return request(`/admin/training/assignments/${target.assignment.id}/terminate`,{method:"POST",body:JSON.stringify({reason:values.reason})});
  if (target.kind === "exempt") return request("/admin/training/courses/exempt",{method:"POST",body:JSON.stringify({assignmentCourseId:target.course.id,reason:values.reason})});
  if (target.kind === "relearn") return request("/admin/training/courses/relearn",{method:"POST",body:JSON.stringify({assignmentCourseId:target.course.id,reason:values.reason})});
  return request(`/admin/training/safety/${target.assignment.id}/revoke`,{method:"POST",body:JSON.stringify({reason:values.reason})});
}

function practicalPayload(target: any, values: any) {
  const items = target.snapshot.payload.practicalItems ?? [];
  return {conclusion:values.conclusion,comment:values.comment,checklist:items.map((item:any)=>({itemId:item.id,passed:Boolean(values.checks?.[item.id])}))};
}

function normalizeAssignment(values: any) {
  return {...values,dueAt:values.dueAt?new Date(values.dueAt).toISOString():undefined};
}

function courseFormValues(course: any) {
  return {
    reason:"",code:course.code,name:course.name,category:course.category,summary:course.summary,audience:course.audience,expectedMinutes:course.expectedMinutes,minimumMinutes:course.minimumMinutes,sortOrder:course.sortOrder,isRequired:course.isRequired,requiresPractical:course.requiresPractical,isSafety:course.isSafety,status:course.status,coverAssetId:course.coverAssetId,
    chapters:course.chapters.map((chapter:any)=>({title:chapter.title,contentHtml:chapter.contentHtml,sortOrder:chapter.sortOrder,isEnabled:chapter.isEnabled,media:chapter.media.map((media:any)=>({fileAssetId:media.fileAssetId,type:media.type,caption:media.caption,durationSeconds:media.durationSeconds,sortOrder:media.sortOrder}))})),
    quiz:course.quiz?{passScore:course.quiz.passScore,maxAttempts:course.quiz.maxAttempts,questions:course.quiz.questions.map((q:any)=>({type:q.type,prompt:q.prompt,optionsText:(q.options??[]).map((o:any)=>`${o.id}|${o.label}`).join("\n"),correctAnswersText:q.correctAnswers.join(","),score:q.score,explanation:q.explanation,sortOrder:q.sortOrder}))}:{passScore:80,questions:[defaultQuestion(1)]},
    practicalItems:course.practicalItems.map((x:any)=>({title:x.title,instructions:x.instructions,isRequired:x.isRequired,sortOrder:x.sortOrder})),
  };
}

function defaultCourseValues() {
  return {reason:"",code:"LIBRARY-",name:"",category:"library",summary:"",audience:"全体教师",expectedMinutes:10,minimumMinutes:0,sortOrder:100,isRequired:false,requiresPractical:false,isSafety:false,status:"draft",chapters:[{title:"第一章",contentHtml:"<p>请配置课程内容</p>",sortOrder:1,isEnabled:true,media:[]}],quiz:{passScore:80,questions:[defaultQuestion(1)]},practicalItems:[]};
}

function defaultQuestion(sortOrder: number) {
  return {type:"single_choice",prompt:"",optionsText:"A|选项一\nB|选项二",correctAnswersText:"A",score:100,explanation:"",sortOrder};
}

function coursePayload(values: any) {
  return {...values,coverAssetId:values.coverAssetId || undefined,chapters:(values.chapters??[]).map((x:any,index:number)=>({...x,sortOrder:x.sortOrder??index+1,media:(x.media??[]).map((m:any,mIndex:number)=>({...m,sortOrder:m.sortOrder??mIndex+1,durationSeconds:m.type === "video"&&m.durationSeconds?Number(m.durationSeconds):undefined}))})),quiz:values.quiz?{passScore:Number(values.quiz.passScore??80),maxAttempts:values.quiz.maxAttempts?Number(values.quiz.maxAttempts):undefined,questions:(values.quiz.questions??[]).map((q:any,index:number)=>({type:q.type,prompt:q.prompt,options:parseOptions(q.optionsText),correctAnswers:String(q.correctAnswersText).split(/[,，]/).map((x:string)=>x.trim()).filter(Boolean),score:Number(q.score),explanation:q.explanation || undefined,sortOrder:index+1}))}:undefined,practicalItems:(values.practicalItems??[]).filter((x:any)=>x.title).map((x:any,index:number)=>({...x,sortOrder:x.sortOrder??index+1}))};
}

function parseOptions(value: string) {
  return String(value).split(/\r?\n/).map((line)=>{const [id,...label]=line.split("|");return {id:id.trim(),label:label.join("|").trim()};}).filter((x)=>x.id&&x.label);
}

function practicalChecklistText(value: unknown, configuredItems: any[]) {
  if (!Array.isArray(value)) return "—";
  const names = new Map(configuredItems.map((item:any)=>[item.id,item.title]));
  return value.map((item:any)=>`${item.passed?"✓":"✗"} ${names.get(item.itemId) ?? item.itemId}${item.note?`（${item.note}）`:""}`).join("；");
}

function safetyRecordColumns() {
  const actionLabels: Record<string,string> = {confirmed:"确认",revoked:"撤销",invalidated:"失效"};
  return [
    {title:"时间",dataIndex:"createdAt",render:formatDate},
    {title:"操作人",dataIndex:["actor","name"],render:empty},
    {title:"动作",dataIndex:"action",render:(value:string)=>actionLabels[value] ?? value},
    {title:"声明/原因",render:(_:unknown,item:any)=>item.declaration || item.reason || "—"},
    {title:"备注",dataIndex:"note",render:empty},
    {title:"有效期至",dataIndex:"validUntil",render:formatDate},
  ];
}

function auditColumns() {
  return [
    {title:"时间",dataIndex:"createdAt",render:formatDate},
    {title:"操作人",dataIndex:["actor","name"],render:empty},
    {title:"动作",dataIndex:"action"},
    {title:"对象",dataIndex:"targetType"},
    {title:"原因/声明",dataIndex:"reason",render:empty},
    {title:"操作前",dataIndex:"before",render:jsonBrief},
    {title:"操作后",dataIndex:"after",render:jsonBrief},
  ];
}

function option(item: Person | Campus) { return {value:item.id,label:item.name}; }
function cleanObject(values: Record<string,string>) { return Object.fromEntries(Object.entries(values).filter(([,v])=>v)) as Record<string,string>; }
function empty(value: unknown) { return value ? String(value) : "—"; }
function jsonBrief(value: unknown) { return value ? <Typography.Text code>{JSON.stringify(value)}</Typography.Text> : "—"; }
function errorText(cause: unknown) { return cause instanceof Error ? cause.message : "请稍后重试"; }
function formatDate(value: unknown) { return value ? new Date(String(value)).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false}) : "—"; }
function statusColor(value: string) { return value === "completed" ? "green" : value === "terminated" ? "default" : value === "frozen" ? "orange" : value === "awaiting_safety" ? "purple" : "blue"; }
