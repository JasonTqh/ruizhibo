// @ts-nocheck
import React, { useRef, useState } from "react";
import { Input, Picker, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import "./index.scss";

const h = React.createElement;
const relationshipOptions = [
  ["father", "父亲"],
  ["mother", "母亲"],
  ["grandfather", "爷爷"],
  ["grandmother", "奶奶"],
  ["maternal_grandfather", "外公"],
  ["maternal_grandmother", "外婆"],
  ["sibling", "兄弟姐妹"],
  ["relative", "亲属"],
  ["other", "其他"],
];

function emptyCheckout() {
  return {
    mode: "authorized",
    selectedPerson: "",
    temporaryName: "",
    temporaryRelationship: "other",
    temporaryPhone: "",
    exceptionReason: "",
    resolution: "",
    remark: "",
  };
}

export default function PickupPage() {
  const [data, setData] = useState(null);
  const [activeClassId, setActiveClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [checkoutStudent, setCheckoutStudent] = useState(null);
  const [checkout, setCheckout] = useState(emptyCheckout());
  const loadingRef = useRef(false);
  const actionLockRef = useRef(false);

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const next = await teacherRequest("/teacher/pickup/today");
      setData(next);
      if (!next.classes.some((item) => item.id === activeClassId)) {
        setActiveClassId(next.classes[0]?.id || "");
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "接送列表加载失败",
      );
    } finally {
      loadingRef.current = false;
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  useDidShow(load);
  usePullDownRefresh(load);

  async function submitAction(student, action, body = {}) {
    if (actionLockRef.current) return false;
    actionLockRef.current = true;
    setActionId(`${student.id}:${action}`);
    try {
      await teacherRequest(`/teacher/pickup/students/${student.id}/${action}`, {
        method: "POST",
        data: body,
      });
      Taro.showToast({ title: actionSuccessText(action), icon: "success" });
      await load();
      return true;
    } catch (actionError) {
      const message =
        actionError instanceof Error ? actionError.message : "操作失败";
      setError(message);
      Taro.showToast({ title: message, icon: "none" });
      return false;
    } finally {
      actionLockRef.current = false;
      setActionId("");
    }
  }

  async function submitBatch(action) {
    if (actionLockRef.current || selectedStudentIds.length === 0) return;
    actionLockRef.current = true;
    setActionId(`batch:${action}`);
    try {
      const result = await teacherRequest(`/teacher/pickup/batch/${action}`, {
        method: "POST",
        data: { studentIds: selectedStudentIds },
      });
      Taro.showToast({
        title:
          action === "picked-up"
            ? `已接到 ${result.count} 人`
            : `${result.count} 人安全到店`,
        icon: "success",
      });
      setSelectedStudentIds([]);
      await load();
    } catch (actionError) {
      const message =
        actionError instanceof Error ? actionError.message : "批量操作失败";
      setError(message);
      Taro.showToast({ title: message, icon: "none" });
    } finally {
      actionLockRef.current = false;
      setActionId("");
    }
  }

  async function directArrival(student) {
    try {
      const result = await Taro.showActionSheet({
        itemList: ["家长送达", "学生自行到店", "其他方式"],
      });
      const methods = ["parent_delivered", "self_arrived", "other"];
      const arrivalMethod = methods[result.tapIndex];
      const body = { arrivalMethod };
      if (
        arrivalMethod === "parent_delivered" &&
        student.deliveryPeople?.length
      ) {
        const personResult = await Taro.showActionSheet({
          itemList: [
            ...student.deliveryPeople.map(
              (person) =>
                `${relationshipText(person.relationship)} · ${person.name}`,
            ),
            "仅记录家长送达（未指定）",
          ],
        });
        const person = student.deliveryPeople[personResult.tapIndex];
        if (person) {
          body.deliveryPersonType = person.type;
          body.deliveryPersonId = person.id;
        }
      }
      await submitAction(student, "arrived", body);
    } catch (actionError) {
      if (String(actionError?.errMsg || actionError).includes("cancel")) return;
      Taro.showToast({ title: "到店方式选择失败", icon: "none" });
    }
  }

  function openCheckout(student) {
    const first = student.pickupPeople?.[0];
    setCheckoutStudent(student);
    setCheckout({
      ...emptyCheckout(),
      selectedPerson: first ? `${first.type}:${first.id}` : "",
      mode: first ? "authorized" : "temporary",
    });
  }

  async function confirmCheckout() {
    if (!checkoutStudent || actionLockRef.current) return;
    let body;
    if (checkout.mode === "authorized") {
      const [pickupPersonType, pickupPersonId] =
        checkout.selectedPerson.split(":");
      if (!pickupPersonType || !pickupPersonId) {
        Taro.showToast({ title: "请选择已授权接送人", icon: "none" });
        return;
      }
      body = {
        status: "normal",
        pickupPersonType,
        pickupPersonId,
        remark: checkout.remark,
      };
    } else {
      if (!checkout.temporaryName.trim() || !checkout.temporaryPhone.trim()) {
        Taro.showToast({ title: "请填写接送人姓名和联系方式", icon: "none" });
        return;
      }
      if (!checkout.resolution.trim()) {
        Taro.showToast({ title: "请填写确认方式和处理结果", icon: "none" });
        return;
      }
      if (checkout.mode === "exception" && !checkout.exceptionReason.trim()) {
        Taro.showToast({ title: "请填写异常原因", icon: "none" });
        return;
      }
      body = {
        status:
          checkout.mode === "temporary"
            ? "temporary_authorization"
            : "exception",
        temporaryName: checkout.temporaryName.trim(),
        temporaryRelationship: checkout.temporaryRelationship,
        temporaryPhone: checkout.temporaryPhone.trim(),
        exceptionReason:
          checkout.mode === "temporary"
            ? "家长临时授权其他人员接送"
            : checkout.exceptionReason.trim(),
        resolution: checkout.resolution.trim(),
        remark: checkout.remark,
      };
    }

    const succeeded = await submitAction(checkoutStudent, "left", body);
    if (succeeded) {
      setCheckoutStudent(null);
      setCheckout(emptyCheckout());
    }
  }

  const activeClass =
    data?.classes?.find((item) => item.id === activeClassId) ||
    data?.classes?.[0];
  const summary = data?.summary || {};
  const classStudents = activeClass?.students || [];
  const visibleStudents =
    statusFilter === "all"
      ? classStudents
      : classStudents.filter((student) => student.status === statusFilter);
  const batchStatus =
    statusFilter === "waiting_pickup" || statusFilter === "picked_up"
      ? statusFilter
      : "";
  const batchStudents = batchStatus
    ? classStudents.filter((student) => student.status === batchStatus)
    : [];
  const allBatchSelected =
    batchStudents.length > 0 &&
    batchStudents.every((student) => selectedStudentIds.includes(student.id));

  function changeClass(classId) {
    setActiveClassId(classId);
    setSelectedStudentIds([]);
  }

  function changeStatus(nextStatus) {
    setStatusFilter(nextStatus);
    setSelectedStudentIds([]);
  }

  function toggleStudent(studentId) {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  }

  function toggleBatchGroup() {
    setSelectedStudentIds(
      allBatchSelected ? [] : batchStudents.map((student) => student.id),
    );
  }

  return h(
    View,
    { className: "pickup-page" },
    h(
      View,
      { className: "pickup-hero" },
      h(
        View,
        null,
        h(Text, { className: "pickup-hero__eyebrow" }, data?.date || "今日"),
        h(Text, { className: "pickup-hero__title" }, "安全接送"),
        h(Text, { className: "pickup-hero__hint" }, "每一步都留下清晰责任记录"),
      ),
      h(
        View,
        {
          className: "pickup-hero__refresh",
          onClick: () => !loading && load(),
        },
        h(Text, null, loading ? "…" : "↻"),
      ),
      h(
        View,
        { className: "pickup-summary" },
        summaryItem("待接", summary.waiting || 0),
        summaryItem("已接到", summary.pickedUp || 0),
        summaryItem("托管中", summary.inCare || 0),
        summaryItem("已离店", summary.left || 0),
      ),
    ),
    error
      ? h(
          View,
          { className: "pickup-error" },
          h(Text, null, error),
          h(Text, { className: "pickup-error__retry", onClick: load }, "重试"),
        )
      : null,
    data?.classes?.length > 1
      ? h(
          View,
          { className: "pickup-class-tabs" },
          ...data.classes.map((item) =>
            h(
              View,
              {
                key: item.id,
                className: `pickup-class-tab${item.id === activeClass?.id ? " pickup-class-tab--active" : ""}`,
                onClick: () => changeClass(item.id),
              },
              h(Text, null, item.name),
            ),
          ),
        )
      : null,
    h(
      View,
      { className: "pickup-list-heading" },
      h(
        Text,
        { className: "pickup-list-heading__title" },
        activeClass?.name || "今日班级",
      ),
      h(
        Text,
        { className: "pickup-list-heading__hint" },
        `${activeClass?.students?.length || 0} 名学生`,
      ),
    ),
    h(
      View,
      { className: "pickup-status-tabs" },
      ...[
        ["all", "全部", classStudents.length],
        [
          "waiting_pickup",
          "待接",
          classStudents.filter((item) => item.status === "waiting_pickup")
            .length,
        ],
        [
          "picked_up",
          "已接到",
          classStudents.filter((item) => item.status === "picked_up").length,
        ],
        [
          "in_care",
          "托管中",
          classStudents.filter((item) => item.status === "in_care").length,
        ],
        [
          "left",
          "已离店",
          classStudents.filter((item) => item.status === "left").length,
        ],
        [
          "absent",
          "请假",
          classStudents.filter((item) => item.status === "absent").length,
        ],
      ].map(([value, label, count]) =>
        h(
          View,
          {
            key: value,
            className: `pickup-status-tab${statusFilter === value ? " pickup-status-tab--active" : ""}`,
            onClick: () => changeStatus(value),
          },
          h(Text, null, `${label} ${count}`),
        ),
      ),
    ),
    batchStatus
      ? h(
          View,
          { className: "pickup-batch" },
          h(
            View,
            { className: "pickup-batch__select", onClick: toggleBatchGroup },
            h(Text, null, allBatchSelected ? "取消全选" : "全选本组"),
          ),
          h(
            Text,
            { className: "pickup-batch__count" },
            `已选 ${selectedStudentIds.length}/${batchStudents.length} 人`,
          ),
          h(
            View,
            {
              className: `pickup-batch__submit${selectedStudentIds.length === 0 || actionId ? " pickup-batch__submit--disabled" : ""}`,
              onClick: () =>
                selectedStudentIds.length > 0 &&
                !actionLockRef.current &&
                submitBatch(
                  batchStatus === "waiting_pickup" ? "picked-up" : "arrived",
                ),
            },
            h(
              Text,
              null,
              actionId.startsWith("batch:")
                ? "处理中…"
                : batchStatus === "waiting_pickup"
                  ? "批量学校接到"
                  : "批量安全到店",
            ),
          ),
        )
      : null,
    h(
      View,
      { className: "pickup-student-list" },
      visibleStudents.length
        ? visibleStudents.map((student) =>
            h(
              View,
              {
                className: `pickup-student pickup-student--${student.status}${student.events?.some((item) => item.isException) ? " pickup-student--exception" : ""}${selectedStudentIds.includes(student.id) ? " pickup-student--selected" : ""}`,
                key: student.id,
              },
              batchStatus
                ? h(
                    View,
                    {
                      className: `pickup-student__select${selectedStudentIds.includes(student.id) ? " pickup-student__select--active" : ""}`,
                      onClick: () => toggleStudent(student.id),
                    },
                    h(
                      Text,
                      null,
                      selectedStudentIds.includes(student.id)
                        ? "✓ 已选择"
                        : "○ 选择",
                    ),
                  )
                : null,
              h(
                View,
                { className: "pickup-student__identity" },
                h(
                  Text,
                  { className: "pickup-student__avatar" },
                  student.name.slice(0, 1),
                ),
                h(
                  View,
                  { className: "pickup-student__copy" },
                  h(Text, { className: "pickup-student__name" }, student.name),
                  h(
                    Text,
                    {
                      className: `pickup-status pickup-status--${student.status}`,
                    },
                    studentStatusText(student.status),
                  ),
                  student.lastEventAt
                    ? h(
                        Text,
                        { className: "pickup-student__time" },
                        timeText(student.lastEventAt),
                      )
                    : null,
                  handoffBadge(student),
                ),
              ),
              batchStatus
                ? null
                : studentAction(
                    student,
                    actionId,
                    submitAction,
                    directArrival,
                    openCheckout,
                  ),
            ),
          )
        : h(
            View,
            { className: "pickup-empty" },
            h(Text, null, loading ? "正在加载学生…" : "当前分组暂无学生"),
          ),
    ),
    checkoutStudent
      ? checkoutPanel(
          checkoutStudent,
          checkout,
          setCheckout,
          () => setCheckoutStudent(null),
          confirmCheckout,
          Boolean(actionId),
        )
      : null,
  );
}

function studentAction(
  student,
  actionId,
  submitAction,
  directArrival,
  openCheckout,
) {
  const busy = actionId.startsWith(`${student.id}:`);
  if (student.status === "waiting_pickup") {
    return h(
      View,
      { className: "pickup-actions" },
      actionButton(busy ? "处理中" : "已接到", "primary", () =>
        submitAction(student, "picked-up"),
      ),
      actionButton("直接到店", "secondary", () => directArrival(student)),
    );
  }
  if (student.status === "picked_up") {
    return actionButton(busy ? "处理中" : "安全到店", "primary", () =>
      submitAction(student, "arrived", { arrivalMethod: "teacher_pickup" }),
    );
  }
  if (student.status === "in_care") {
    return actionButton("办理离店", "checkout", () => openCheckout(student));
  }
  return h(
    Text,
    { className: "pickup-student__done" },
    student.status === "left" ? "今日已完成" : "无需操作",
  );
}

function checkoutPanel(student, form, setForm, onClose, onSubmit, submitting) {
  const relationshipIndex = Math.max(
    0,
    relationshipOptions.findIndex(
      ([value]) => value === form.temporaryRelationship,
    ),
  );
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return h(
    View,
    { className: "checkout-mask", onClick: onClose },
    h(
      View,
      {
        className: "checkout-panel",
        onClick: (event) => event.stopPropagation(),
      },
      h(
        View,
        { className: "checkout-panel__heading" },
        h(
          View,
          null,
          h(Text, { className: "checkout-panel__eyebrow" }, "离店交接确认"),
          h(Text, { className: "checkout-panel__title" }, student.name),
        ),
        h(Text, { className: "checkout-panel__close", onClick: onClose }, "×"),
      ),
      h(
        View,
        { className: "checkout-modes" },
        modeButton("authorized", "已授权接送人", form, update),
        modeButton("temporary", "临时授权", form, update),
        modeButton("exception", "异常放行", form, update),
      ),
      form.mode === "authorized"
        ? h(
            View,
            { className: "checkout-people" },
            student.pickupPeople?.length
              ? student.pickupPeople.map((person) => {
                  const value = `${person.type}:${person.id}`;
                  return h(
                    View,
                    {
                      key: value,
                      className: `checkout-person${form.selectedPerson === value ? " checkout-person--active" : ""}`,
                      onClick: () => update("selectedPerson", value),
                    },
                    h(
                      Text,
                      { className: "checkout-person__radio" },
                      form.selectedPerson === value ? "●" : "○",
                    ),
                    h(
                      View,
                      null,
                      h(
                        Text,
                        { className: "checkout-person__name" },
                        `${relationshipText(person.relationship)} · ${person.name}`,
                      ),
                      h(
                        Text,
                        { className: "checkout-person__phone" },
                        person.phone || "未留电话",
                      ),
                    ),
                  );
                })
              : h(
                  Text,
                  { className: "checkout-empty" },
                  "暂无已授权接送人，请选择临时授权并完成核验",
                ),
          )
        : h(
            View,
            { className: "checkout-form" },
            formInput(
              "接送人姓名",
              "请输入真实姓名",
              form.temporaryName,
              (value) => update("temporaryName", value),
            ),
            h(
              View,
              { className: "checkout-field" },
              h(Text, { className: "checkout-field__label" }, "与学生关系"),
              h(
                Picker,
                {
                  mode: "selector",
                  range: relationshipOptions.map((item) => item[1]),
                  value: relationshipIndex,
                  onChange: (event) =>
                    update(
                      "temporaryRelationship",
                      relationshipOptions[Number(event.detail.value)][0],
                    ),
                },
                h(
                  Text,
                  { className: "checkout-picker" },
                  relationshipOptions[relationshipIndex][1],
                ),
              ),
            ),
            formInput(
              "联系方式",
              "用于核验的手机号",
              form.temporaryPhone,
              (value) => update("temporaryPhone", value),
              "number",
            ),
            form.mode === "exception"
              ? formInput(
                  "异常原因",
                  "例如：身份资料无法完全确认",
                  form.exceptionReason,
                  (value) => update("exceptionReason", value),
                )
              : null,
            formTextarea(
              "确认方式 / 处理结果",
              "例如：已电话联系母亲确认临时接送",
              form.resolution,
              (value) => update("resolution", value),
            ),
          ),
      formTextarea("交接备注（选填）", "补充现场情况", form.remark, (value) =>
        update("remark", value),
      ),
      form.mode !== "authorized"
        ? h(
            Text,
            { className: "checkout-warning" },
            "⚠ 临时或异常接送会被醒目标记，并永久保留处理记录。",
          )
        : null,
      h(
        View,
        {
          className: "checkout-submit",
          onClick: () => !submitting && onSubmit(),
        },
        h(Text, null, submitting ? "正在确认…" : "确认离店"),
      ),
    ),
  );
}

function summaryItem(label, value) {
  return h(
    View,
    { className: "pickup-summary__item" },
    h(Text, { className: "pickup-summary__value" }, value),
    h(Text, { className: "pickup-summary__label" }, label),
  );
}

function actionButton(label, tone, onClick) {
  return h(
    View,
    { className: `pickup-button pickup-button--${tone}`, onClick },
    h(Text, null, label),
  );
}

function modeButton(value, label, form, update) {
  return h(
    View,
    {
      className: `checkout-mode${form.mode === value ? " checkout-mode--active" : ""}`,
      onClick: () => update("mode", value),
    },
    h(Text, null, label),
  );
}

function formInput(label, placeholder, value, onChange, type = "text") {
  return h(
    View,
    { className: "checkout-field" },
    h(Text, { className: "checkout-field__label" }, label),
    h(Input, {
      className: "checkout-input",
      value,
      type,
      placeholder,
      onInput: (event) => onChange(event.detail.value),
    }),
  );
}

function formTextarea(label, placeholder, value, onChange) {
  return h(
    View,
    { className: "checkout-field" },
    h(Text, { className: "checkout-field__label" }, label),
    h(Textarea, {
      className: "checkout-textarea",
      value,
      placeholder,
      maxlength: 300,
      onInput: (event) => onChange(event.detail.value),
    }),
  );
}

function studentStatusText(status) {
  return (
    {
      waiting_pickup: "待接",
      picked_up: "已接到 · 前往中心",
      in_care: "已安全到店 · 托管中",
      left: "已离店",
      absent: "请假 / 缺勤",
    }[status] || status
  );
}

function handoffBadge(student) {
  const handoff = [...(student.events || [])]
    .reverse()
    .find((event) => event.type === "left_center");
  if (handoff?.status === "temporary_authorization") {
    return h(
      Text,
      { className: "pickup-handoff-tag pickup-handoff-tag--temporary" },
      "临时授权",
    );
  }
  if (handoff?.status === "exception") {
    return h(
      Text,
      { className: "pickup-handoff-tag pickup-handoff-tag--exception" },
      "⚠ 异常接送",
    );
  }
  return null;
}

function relationshipText(value) {
  return relationshipOptions.find((item) => item[0] === value)?.[1] || value;
}

function timeText(value) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function actionSuccessText(action) {
  return action === "picked-up"
    ? "已登记接到"
    : action === "arrived"
      ? "已安全到店"
      : "已确认离店";
}
