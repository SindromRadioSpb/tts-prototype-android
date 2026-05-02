import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

OLD = (
    "  // Build table HTML — Actions first (if visible), then content columns, no # column\n"
    "  let html = `\n"
    "    <table id=\"proTable\" class=\"proTable\" data-text-id=\"${textId}\">\n"
    "      <thead>\n"
    "        <tr>\n"
    "          ${showAction ? '<th class=\"col-action-cell\">▶📝</th>' : ''}\n"
    "          ${showHe ? '<th>Hebrew</th>' : ''}\n"
    "          ${showNiq ? '<th>Niqqud</th>' : ''}\n"
    "          ${showTr ? '<th>Translit</th>' : ''}\n"
    "          ${showRu ? '<th>Translation</th>' : ''}\n"
    "        </tr>\n"
    "      </thead>\n"
    "      <tbody>\n"
    "  `;"
)

NEW = (
    "  // Sync Classic tableVisibleColumns for resize width computation\n"
    "  if (typeof tableVisibleColumns !== \"undefined\") {\n"
    "    tableVisibleColumns.action = showAction;\n"
    "    tableVisibleColumns.he = showHe;\n"
    "    tableVisibleColumns.niqqud = showNiq;\n"
    "    tableVisibleColumns.translit = showTr;\n"
    "    tableVisibleColumns.ru = showRu;\n"
    "  }\n"
    "\n"
    "  // Build ordered active column list using Classic key names\n"
    "  const ideColList = [\n"
    "    { k: \"action\",   show: showAction, label: \"\\u25b6\\u{1f4dd}\", hCls: \"col-action-cell\" },\n"
    "    { k: \"he\",       show: showHe,     label: typeof t===\"function\" ? t(\"table.colHebrew\")      : \"HEBREW\",      hCls: \"\" },\n"
    "    { k: \"niqqud\",   show: showNiq,    label: typeof t===\"function\" ? t(\"table.colNiqqud\")      : \"NIQQUD\",      hCls: \"\" },\n"
    "    { k: \"translit\", show: showTr,     label: typeof t===\"function\" ? t(\"table.colTranslitLat\") : \"TRANSLIT\",    hCls: \"\" },\n"
    "    { k: \"ru\",       show: showRu,     label: typeof t===\"function\" ? t(\"table.colTranslation\") : \"TRANSLATION\", hCls: \"\" }\n"
    "  ].filter(c => c.show);\n"
    "  const ideActiveKeys = ideColList.map(c => c.k);\n"
    "\n"
    "  // Compute proportional widths from tableBaseWidths\n"
    "  const ideColWidths = {};\n"
    "  const _ideTco = [\"action\",\"he\",\"niqqud\",\"translit\",\"ru\"];\n"
    "  let _ideWSum = 0;\n"
    "  _ideTco.forEach(function(k, i) {\n"
    "    if (ideActiveKeys.indexOf(k) >= 0) {\n"
    "      const w = (typeof tableBaseWidths !== \"undefined\" && Number.isFinite(+tableBaseWidths[i]) && +tableBaseWidths[i] > 0)\n"
    "        ? +tableBaseWidths[i] : 20;\n"
    "      ideColWidths[k] = w;\n"
    "      _ideWSum += w;\n"
    "    }\n"
    "  });\n"
    "  if (_ideWSum > 0) { ideActiveKeys.forEach(k => { ideColWidths[k] = ideColWidths[k] / _ideWSum * 100; }); }\n"
    "\n"
    "  // Build table HTML with colgroup + resize grips\n"
    "  let html = '<table id=\"proTable\" class=\"proTable\"'\n"
    "    + ' data-text-id=\"' + v3EscapeHtml(String(textId)) + '\"'\n"
    "    + ' data-cols=\"' + ideActiveKeys.join(',') + '\">' \n"
    "    + '<colgroup>';\n"
    "  ideActiveKeys.forEach(k => {\n"
    "    html += '<col data-col=\"' + k + '\" style=\"width:' + (ideColWidths[k]||20).toFixed(4) + '%;\">'; \n"
    "  });\n"
    "  html += '</colgroup><thead><tr>';\n"
    "  ideColList.forEach(c => {\n"
    "    const grip = '<div class=\"col-resizer\" data-resize=\"1\" title=\"\\u041f\\u043e\\u0442\\u044f\\u043d\\u0438\\u0442\\u0435 \\u0434\\u043b\\u044f \\u0438\\u0437\\u043c\\u0435\\u043d\\u0435\\u043d\\u0438\\u044f \\u0448\\u0438\\u0440\\u0438\\u043d\\u044b.\"></div>';\n"
    "    html += '<th data-col=\"' + c.k + '\"' + (c.hCls ? ' class=\"' + c.hCls + '\"' : '') + '>' + c.label + grip + '</th>';\n"
    "  });\n"
    "  html += '</tr></thead><tbody>';"
)

if OLD in html:
    html = html.replace(OLD, NEW, 1)
    print("OK: replaced table HTML header block")
else:
    print("MISS: table HTML header block not found")

# Part 2: after content.innerHTML = html; add resize hooks
OLD2 = (
    "  content.innerHTML = html;\n"
    "\n"
    "  // PATCH-17.6: Refresh audio cache indicators after table render"
)

NEW2 = (
    "  content.innerHTML = html;\n"
    "\n"
    "  // Bind column resize handlers and apply stored widths\n"
    "  try { if (typeof attachResizeHandlers === \"function\") attachResizeHandlers(); } catch(e) {}\n"
    "  try { if (typeof applyColgroupWidthsToDom === \"function\") applyColgroupWidthsToDom(); } catch(e) {}\n"
    "\n"
    "  // PATCH-17.6: Refresh audio cache indicators after table render"
)

if OLD2 in html:
    html = html.replace(OLD2, NEW2, 1)
    print("OK: added post-render resize hooks")
else:
    print("MISS: post-render hooks insertion point not found")

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
