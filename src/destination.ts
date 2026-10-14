import { api } from "./api";
import { element, button, dialog, field } from "./ui";
import { type Config, safeTitle } from "./core";
import type BrowserPlugin from "./index";

export function normalizeParentPath(path: string): string {
  return (
    "/" + path.trim().replaceAll("\\", "/").split("/").filter(Boolean).join("/")
  );
}
export function searchDocumentParent(hPath: string): string {
  // searchDocs prefixes hPath with the notebook name; createDocWithMd does not.
  const parts = hPath.replace(/^\//, "").split("/");
  return normalizeParentPath(parts.slice(1).join("/"));
}
export function normalizeTags(tags: string): string {
  return [
    ...new Set(
      tags
        .replaceAll("#", "")
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].join(",");
}
export async function resolveParentPath(config: Config): Promise<string> {
  const value =
    config.savePathMode === "template"
      ? await api<string>("template/renderSprig", {
          template: config.pathTemplate || "/",
        })
      : config.parentPath;
  if (typeof value !== "string") throw Error("无法解析保存路径");
  return normalizeParentPath(value);
}

export async function chooseDestination(
  p: BrowserPlugin,
  title?: string,
): Promise<void> {
  const { notebooks } = await api("notebook/lsNotebooks", {});
  return new Promise((resolve, reject) => {
    let settled = false;
    const d = dialog(title ? p.t("save") : p.t("destination"), () => {
      if (!settled) {
        settled = true;
        reject(Error("Cancelled"));
      }
    });
    d.body.classList.add("sb-save-options");
    let mode = p.config.savePathMode,
      searchEpoch = 0,
      previewEpoch = 0,
      dbEpoch = 0;
    const notebook = element("select", "b3-select");
    for (const n of notebooks.filter((n: any) => !n.closed))
      notebook.add(new Option(n.name, n.id));
    notebook.value = p.config.notebook || notebook.options[0]?.value || "";
    const path = element("input", "b3-text-field");
    path.value = p.config.pathTemplate;
    path.placeholder = '/剪藏/{{now | date "2006/01"}}';
    const search = element("input", "b3-text-field");
    search.placeholder = p.t("searchPath");
    const parents = element("select", "b3-select");
    let parentPath = p.config.parentPath || "/";
    parents.add(new Option(parentPath, parentPath));
    const preview = element("div", "sb-save-preview");
    const error = element("p", "ft__error");
    const database = element("select", "b3-select");
    database.add(new Option(p.t("none"), ""));
    if (p.config.databaseID)
      database.add(
        new Option(
          p.config.databaseName || p.config.databaseID,
          p.config.databaseID,
        ),
      );
    database.value = p.config.databaseID;
    const dbSearch = element("input", "b3-text-field");
    dbSearch.placeholder = p.t("searchDatabase");
    const template = element("select", "b3-select");
    template.add(new Option(p.t("none"), ""));
    const tags = element("input", "b3-text-field");
    tags.placeholder = p.t("tagsHint");
    tags.value = p.config.tags;
    let databases: any[] = [
      {
        avID: p.config.databaseID,
        blockID: p.config.databaseBlockID,
        viewID: p.config.databaseViewID,
      },
    ];
    const draft = (): Config => ({
      ...p.config,
      notebook: notebook.value,
      savePathMode: mode,
      parentPath,
      pathTemplate: path.value,
    });
    const refreshPreview = async () => {
      const epoch = ++previewEpoch;
      try {
        const parent = template.value ? "" : await resolveParentPath(draft());
        if (epoch !== previewEpoch || settled) return;
        preview.textContent = template.value
          ? p.t("templateControlsPath")
          : `${p.t("pathPreview")}\n${notebook.selectedOptions[0]?.textContent || ""} ${parent === "/" ? "" : parent}/${safeTitle(title || p.t("articleTitle"))}`;
        error.textContent = "";
      } catch (e) {
        if (epoch === previewEpoch) error.textContent = String(e);
      }
    };
    const templateFields = element("div"),
      searchFields = element("div");
    templateFields.append(
      field(p.t("pathTemplate"), path),
      element("small", "ft__on-surface", p.t("pathHint")),
    );
    searchFields.append(search, parents);
    const switchMode = button("", () => {
      mode = mode === "template" ? "search" : "template";
      updateMode();
    });
    const updateMode = () => {
      templateFields.hidden = mode !== "template";
      searchFields.hidden = mode !== "search";
      switchMode.textContent = p.t(
        mode === "template" ? "useSearchPath" : "useTemplatePath",
      );
      for (const input of [notebook, path, search, parents, switchMode])
        input.disabled = !!template.value;
      void refreshPreview();
    };
    const loadParents = async () => {
      const epoch = ++searchEpoch;
      try {
        const docs = await api<any[]>("filetree/searchDocs", {
          k: search.value,
          flashcard: false,
        });
        if (epoch !== searchEpoch || settled) return;
        parents.replaceChildren(new Option("/", "/"));
        if (parentPath !== "/") parents.add(new Option(parentPath, parentPath));
        for (const doc of docs || [])
          if (
            doc.box === notebook.value &&
            doc.hPath &&
            searchDocumentParent(doc.hPath) !== parentPath
          )
            parents.add(new Option(doc.hPath, searchDocumentParent(doc.hPath)));
        parents.value = parentPath;
      } catch (e) {
        if (epoch === searchEpoch) error.textContent = String(e);
      }
    };
    let templatesReady = false,
      templateEpoch = 0;
    const loadTemplates = async (selected = "") => {
      const id = database.value,
        epoch = ++templateEpoch;
      templatesReady = false;
      template.disabled = true;
      template.replaceChildren(new Option(p.t("none"), ""));
      updateMode();
      try {
        if (id) {
          const result = await api("av/getAttributeView", { id });
          if (epoch !== templateEpoch || database.value !== id || settled)
            return;
          for (const item of result.av?.newItemTemplates || [])
            if (item.targetType === "document")
              template.add(new Option(item.name, item.id));
          if (
            selected &&
            !Array.from(template.options).some((o) => o.value === selected)
          )
            throw Error(p.t("missingTemplate"));
          template.value = selected;
        }
        templatesReady = true;
        template.disabled = !id;
        updateMode();
      } catch (e) {
        error.textContent = String(e);
      }
    };
    const loadDatabases = async () => {
      const epoch = ++dbEpoch;
      try {
        const result = await api("av/searchAttributeView", {
          avID: "",
          keyword: dbSearch.value,
        });
        if (epoch !== dbEpoch || settled) return;
        const selected = database.value,
          label = database.selectedOptions[0]?.textContent || selected;
        databases = [...(result.results || []), ...databases];
        database.replaceChildren(new Option(p.t("none"), ""));
        const seen = new Set<string>();
        for (const db of databases)
          if (db.avID && !seen.has(db.avID)) {
            seen.add(db.avID);
            database.add(
              new Option(
                db.avName
                  ? db.avName + (db.hPath ? " · " + db.hPath : "")
                  : label,
                db.avID,
              ),
            );
          }
        database.value = selected;
      } catch (e) {
        error.textContent = String(e);
      }
    };
    search.oninput = () => void loadParents();
    dbSearch.oninput = () => void loadDatabases();
    notebook.onchange = () => {
      parentPath = "/";
      void loadParents();
      void refreshPreview();
    };
    parents.onchange = () => {
      parentPath = parents.value;
      void refreshPreview();
    };
    path.oninput = () => void refreshPreview();
    database.onchange = () => void loadTemplates();
    template.onchange = updateMode;
    const submit = button(title ? p.t("save") : p.t("saveDestination"), () => {
      void (async () => {
        submit.disabled = true;
        try {
          if (!templatesReady) throw Error(p.t("waitTemplates"));
          if (!template.value && !notebook.value) throw Error(p.t("notebook"));
          if (!template.value) await resolveParentPath(draft());
          const db = databases.find((x) => x.avID === database.value);
          Object.assign(p.config, draft(), {
            databaseID: database.value,
            databaseName: database.value
              ? database.selectedOptions[0]?.textContent || ""
              : "",
            databaseBlockID: db?.blockID || "",
            databaseViewID: db?.viewID || "",
            databaseTemplateID: template.value,
            tags: normalizeTags(tags.value),
          });
          p.persist();
          settled = true;
          d.dialog.destroy();
          resolve();
        } catch (e) {
          error.textContent = String(e);
          submit.disabled = false;
        }
      })();
    });
    const heading = element("div", "sb-save-heading");
    heading.append(element("strong", "", p.t("savePath")), switchMode);
    d.body.append(
      heading,
      field(p.t("notebook"), notebook),
      templateFields,
      searchFields,
      preview,
      field(p.t("database"), database),
      dbSearch,
      field(p.t("databaseTemplate"), template),
      field(p.t("tags"), tags),
      error,
      button(p.t("cancel"), () => d.dialog.destroy()),
      submit,
    );
    updateMode();
    void loadParents();
    void loadDatabases();
    void loadTemplates(p.config.databaseTemplateID);
  });
}
