"use strict";

// Presentation catalog for the immutable Physics Year 1 edition. Task membership
// and counts always come from pinned publication snapshots; this file supplies
// localized chapter labels that edition 2 did not embed in its item projection.
const SLUG = "physics-year1-problems";
const SECTIONS = Object.freeze({
  1: Object.freeze({
    title_he: "פרק 1: בעיות בתחום תנועה שוות תאוצה",
    title_ru: "Глава 1: Задачи на тему прямолинейного равноускоренного движения",
    title_en: "Chapter 1: Uniformly accelerated motion",
  }),
  2: Object.freeze({
    title_he: "פרק 2: בעיות בתחום זריקה אנכית כלפי מעלה/מטה",
    title_ru: "Глава 2: Вертикальный бросок вверх и вниз",
    title_en: "Chapter 2: Vertical launch upward and downward",
  }),
  3: Object.freeze({
    title_he: "פרק 3: בעיות בתחום זריקה אופקית",
    title_ru: "Глава 3: Горизонтальный бросок",
    title_en: "Chapter 3: Horizontal projectile motion",
  }),
  4: Object.freeze({
    title_he: "פרק 4: בעיות בתחום זריקה משופעת (זוויתית)",
    title_ru: "Глава 4: Бросок под углом",
    title_en: "Chapter 4: Angled projectile motion",
  }),
  5: Object.freeze({
    title_he: "פרק 5: בעיות בתחום כוחות במישור וחיכוך",
    title_ru: "Глава 5: Силы на плоскости и трение",
    title_en: "Chapter 5: Forces on a plane and friction",
  }),
  6: Object.freeze({
    title_he: "פרק 6: בעיות בתחום תנועה במישור משופע",
    title_ru: "Глава 6: Движение по наклонной плоскости",
    title_en: "Chapter 6: Motion on an inclined plane",
  }),
  7: Object.freeze({
    title_he: "פרק 7: בעיות בתחום אנרגיה וקפיצים",
    title_ru: "Глава 7: Энергия и пружины",
    title_en: "Chapter 7: Energy and springs",
  }),
  8: Object.freeze({
    title_he: "פרק 8: בעיות בתחום אנרגיה ומתקף ותנע",
    title_ru: "Глава 8: Энергия, импульс силы и количество движения",
    title_en: "Chapter 8: Energy, impulse and momentum",
  }),
  9: Object.freeze({
    title_he: "פרק 9: בעיות בתחום אנרגיה ותנועה מעגלית",
    title_ru: "Глава 9: Энергия и движение по окружности",
    title_en: "Chapter 9: Energy and circular motion",
  }),
});

function physicsTaskMeta(snapshot) {
  const text = snapshot && snapshot.library && Array.isArray(snapshot.library.texts) && snapshot.library.texts[0];
  const meta = text && text.source_meta && text.source_meta.physics_task;
  const chapter = Number(meta && meta.chapter);
  const taskNumber = String(meta && meta.task_number || "");
  if (!Number.isInteger(chapter) || !SECTIONS[chapter] || !/^\d+\.\d+$/.test(taskNumber)) {
    const error = new Error("PHYSICS_SECTION_METADATA_INVALID");
    error.code = "PHYSICS_SECTION_METADATA_INVALID";
    throw error;
  }
  return Object.freeze({ chapter, task_number: taskNumber });
}

function sectionLabels(chapter) {
  const value = SECTIONS[Number(chapter)];
  if (!value) throw new Error("PHYSICS_SECTION_UNKNOWN");
  return value;
}

module.exports = { SLUG, SECTIONS, physicsTaskMeta, sectionLabels };
