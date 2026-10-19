(function () {
  "use strict";
  const catalog = window.WorkflowReference;
  const form = document.querySelector("#config");
  const byId = new Map(catalog.topics.map(topic => [topic.id, topic]));
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function link(topic, text) {
    const a = element("a", text);
    a.href = `#ref-${topic}`;
    return a;
  }
  function example(text) {
    const pre = element("pre");
    pre.append(element("code", text));
    pre.tabIndex = 0;
    return pre;
  }
  function labeled(parent, label, text) {
    const p = element("p");
    p.append(element("strong", `${label} `), document.createTextNode(text));
    parent.append(p);
  }
  for (const [name, field] of Object.entries(catalog.fields)) {
    const input = form.elements.namedItem(name);
    const label = input.labels[0];
    const topic = byId.get(field.topic);
    const help = element("aside", undefined, "field-guide");
    help.dataset.control = name;
    const purpose = element("p", field.purpose);
    purpose.id = `purpose-${name}`;
    const details = element("details");
    details.append(element("summary", `Before choosing: ${label.textContent.trim()}`));
    labeled(details, "Placement & value:", field.value);
    details.append(example(field.example.replace(/\\n(?=  )/g, "\n")));
    labeled(details, "Watch out:", topic.gotchas);
    details.append(link(field.topic, `Read the ${topic.title} reference`));
    help.append(purpose, details);
    label.before(help);
    input.setAttribute("aria-describedby", [input.getAttribute("aria-describedby"), purpose.id].filter(Boolean).join(" "));
  }
  document.querySelector("#walkthrough-code").append(example(catalog.walkthrough));
  const notes = document.querySelector("#walkthrough-notes");
  for (const [id, text] of catalog.annotations) {
    const li = element("li");
    li.append(link(id, byId.get(id).title), document.createTextNode(`: ${text}`));
    notes.append(li);
  }
  const list = document.querySelector("#reference-list");
  const cards = new Map();
  for (const topic of catalog.topics) {
    const card = element("details", undefined, "reference-card");
    card.id = `ref-${topic.id}`;
    const summary = element("summary", topic.title);
    const body = element("div", undefined, "reference-body");
    body.append(element("p", `${topic.group} / ${topic.support}`, "reference-badge"));
    labeled(body, "What it is for:", topic.purpose);
    labeled(body, "Where it belongs:", topic.scope);
    labeled(body, "Value & type:", topic.values);
    body.append(element("h4", topic.complete ? "Complete workflow example (not executed)" : "Scoped fragment (not a standalone workflow)"));
    body.append(example(topic.example));
    labeled(body, "Before you use it:", topic.gotchas);
    const links = element("p", undefined, "reference-links");
    const official = element("a", "Official source and full constraints");
    official.href = topic.source;
    links.append(official, link(topic.id, "Link to this topic"));
    body.append(links);
    card.append(summary, body);
    cards.set(topic.id, card);
    list.append(card);
  }
  const search = document.querySelector("#reference-search");
  const category = document.querySelector("#reference-category");
  for (const group of new Set(catalog.topics.map(t => t.group))) {
    const option = element("option", group);
    option.value = group;
    category.append(option);
  }
  function filter() {
    const matches = catalog.search(search.value, category.value);
    const ids = new Set(matches.map(t => t.id));
    for (const [id, card] of cards) card.hidden = !ids.has(id);
    document.querySelector("#reference-count").textContent =
      `${matches.length} of ${catalog.topics.length} topics. ${matches.length ? "Open a topic to read its purpose, scope, example and gotchas." : "No matches. Try fewer words or clear the filters."}`;
  }
  search.addEventListener("input", filter);
  category.addEventListener("change", filter);
  document.querySelector("#reference-clear").addEventListener("click", () => {
    search.value = "";
    category.value = "";
    filter();
    search.focus();
  });
  function openTopic() {
    const id = window.location.hash.slice(1).replace(/^ref-/, "");
    if (!window.location.hash.startsWith("#ref-") || !cards.has(id)) return;
    search.value = "";
    category.value = "";
    filter();
    const card = cards.get(id);
    card.open = true;
    card.querySelector("summary").focus({ preventScroll: true });
    card.scrollIntoView({ block: "start", behavior: "instant" });
  }
  window.addEventListener("hashchange", openTopic);
  // Clicking the current fragment does not produce hashchange a second time.
  document.addEventListener("click", event => {
    const anchor = event.target.closest('a[href^="#ref-"]');
    if (anchor && anchor.hash === window.location.hash) openTopic();
  });
  document.querySelector("#reference-checked").textContent = `Sources checked ${catalog.checked}.`;
  filter();
  openTopic();
  function renderPreview(container, text) {
    container.replaceChildren();
    for (const line of text.split(/(?<=\n)/)) {
      const match = /^(\s*)"([^"]+)":/.exec(line);
      const topic = match && catalog.previewTopic(match[2], match[1].length);
      if (!topic) { container.append(document.createTextNode(line)); continue; }
      const start = match[1].length;
      const end = start + match[2].length + 2;
      container.append(document.createTextNode(line.slice(0, start)));
      const a = link(topic, line.slice(start, end));
      a.title = `Explain ${match[2]}: ${byId.get(topic).title}`;
      container.append(a, document.createTextNode(line.slice(end)));
    }
  }
  window.WorkflowGuide = Object.freeze({ renderPreview });
})();
