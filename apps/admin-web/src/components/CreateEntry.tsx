import { cloneElement, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Button, Modal } from "antd";

export default function CreateEntry({
  title,
  buttonText = title,
  children,
  editTarget,
  onOpen,
  onCancel,
  contextKey,
}: {
  title: string;
  buttonText?: string;
  children: ReactElement<any>;
  editTarget?: unknown;
  onOpen?: () => void;
  onCancel?: () => void;
  contextKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (editTarget) setOpen(true);
  }, [editTarget]);
  useEffect(() => {
    setOpen(false);
  }, [contextKey]);
  return (
    <>
      <Button
        type="primary"
        onClick={() => {
          onOpen?.();
          setOpen(true);
        }}
      >
        {buttonText}
      </Button>
      <Modal
        title={title}
        open={open}
        width={800}
        footer={null}
        forceRender
        closable={!saving}
        maskClosable={!saving}
        onCancel={() => {
          if (lock.current) return;
          setOpen(false);
          if (onCancel) onCancel();
          else children.props.form?.resetFields();
        }}
      >
        {cloneElement(children, {
          layout: "vertical",
          disabled: saving,
          onFinish: async (values: unknown) => {
            if (lock.current) return;
            lock.current = true;
            setSaving(true);
            try {
              const result = await children.props.onFinish?.(values);
              if (result !== false) setOpen(false);
            } catch (error) {
              Modal.error({
                title: "保存失败",
                content: error instanceof Error ? error.message : "请稍后重试",
              });
            } finally {
              lock.current = false;
              setSaving(false);
            }
          },
        })}
      </Modal>
    </>
  );
}
