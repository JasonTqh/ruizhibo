export const academySections = [
  {
    key: "overview",
    label: "学院总览",
    description: "查看培训进展、风险提醒与学院工作入口",
  },
  {
    key: "courses",
    label: "课程资料库",
    description: "维护课程、章节、媒体、测验及实操要求",
  },
  {
    key: "assignments",
    label: "培训任务",
    description: "布置培训、指定带教、跟进期限与培训轮次",
  },
  {
    key: "records",
    label: "学习档案",
    description: "按教师查询学习进度、测验、实操和历史轮次",
  },
  {
    key: "practical",
    label: "实操考核",
    description: "处理带教实操检查并记录考核结论",
  },
  {
    key: "safety",
    label: "安全认证",
    description: "核验安全培训条件并完成责任确认",
  },
  {
    key: "feedback",
    label: "培训反馈",
    description: "查阅培训感悟、评分与改进建议",
  },
  {
    key: "flags",
    label: "校区开关",
    description: "按校区控制教师学院的开放范围",
  },
  {
    key: "permissions",
    label: "权限管理",
    description: "配置培训管理、实操考核及安全确认权限",
  },
  {
    key: "audit",
    label: "学院审计",
    description: "追溯学院管理操作及变更原因",
  },
] as const;

export function canAccessAcademySection(
  section: string,
  capabilities: {
    trainingManage: boolean;
    practicalConfirm: boolean;
    safetyConfirm: boolean;
    permissionManage: boolean;
  },
) {
  if (!academySections.some((item) => item.key === section)) return false;
  if (section === "overview")
    return (
      capabilities.trainingManage ||
      capabilities.practicalConfirm ||
      capabilities.safetyConfirm
    );
  if (section === "practical") return capabilities.practicalConfirm;
  if (section === "safety") return capabilities.safetyConfirm;
  if (section === "permissions")
    return capabilities.trainingManage && capabilities.permissionManage;
  return capabilities.trainingManage;
}
