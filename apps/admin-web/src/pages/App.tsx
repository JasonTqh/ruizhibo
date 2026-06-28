import { Card, Col, Layout, Menu, Row, Statistic, Typography } from "antd";

const modules = [
  "工作台",
  "老师管理",
  "班级管理",
  "学生管理",
  "家长绑定",
  "流程模板",
  "数据报表",
];

export function App() {
  return (
    <Layout className="admin-shell">
      <Layout.Sider width={220} className="admin-sider">
        <div className="brand">锐之博后台</div>
        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={["工作台"]}
          items={modules.map((label) => ({ key: label, label }))}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header className="admin-header">
          <Typography.Title level={3}>运营管理工作台</Typography.Title>
        </Layout.Header>
        <Layout.Content className="admin-content">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic title="在读学生" value={24} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic title="今日流程完成率" value={0} suffix="%" />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic title="待批作业" value={6} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic title="未读消息" value={3} />
              </Card>
            </Col>
          </Row>
          <Card className="todo-card" title="后续开发模块">
            <p>这里是后台管理骨架，后续接入真实 API 后实现老师、班级、学生、家长绑定和流程模板管理。</p>
          </Card>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
