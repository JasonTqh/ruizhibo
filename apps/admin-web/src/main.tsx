import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { App } from "./pages/App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          fontSize: 15,
          controlHeight: 40,
          controlHeightSM: 36,
          controlHeightLG: 48,
          colorTextPlaceholder: "#737d78",
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
