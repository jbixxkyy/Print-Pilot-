const printerId = "main";

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function setStatus(message) {
  setText("actionStatus", message);
}

async function refresh() {
  setStatus("Refreshing...");
  try {
    const [list, info, status, progress, temps, files] = await Promise.all([
      getJson("/api/printers"),
      getJson(`/api/printers/${printerId}/info`),
      getJson(`/api/printers/${printerId}/status`),
      getJson(`/api/printers/${printerId}/progress`),
      getJson(`/api/printers/${printerId}/temperatures`),
      getJson(`/api/printers/${printerId}/files`),
    ]);

    const printer = list.find((item) => item.name === printerId) || list[0];
    const badge = document.getElementById("statusBadge");
    badge.textContent = printer?.isOnline ? "Online" : "Offline";
    badge.className = `badge ${printer?.isOnline ? "online" : "offline"}`;

    setText("printerName", info.name || printerId);
    setText("modelName", info.modelName || "-");
    setText("firmware", info.firmwareVersion || "-");
    setText("currentFile", status.currentFile || "Idle");
    setText("layerProgress", `${progress.layer?.[0] ?? 0} / ${progress.layer?.[1] ?? 0}`);
    setText("byteProgress", `${progress.byte?.[0] ?? 0} / ${progress.byte?.[1] ?? 0}`);
    setText("nozzleTemp", temps.T0 ? `${temps.T0.current} / ${temps.T0.target} C` : "-");
    setText("bedTemp", temps.B ? `${temps.B.current} / ${temps.B.target} C` : "-");

    const snapshotImage = document.getElementById("snapshotImage");
    snapshotImage.src = `/api/printers/${printerId}/snapshot?t=${Date.now()}`;

    renderFiles(files);
    setStatus("Ready");
  } catch (error) {
    setStatus(error.message);
  }
}

function renderFiles(files) {
  const filesState = document.getElementById("filesState");
  const list = document.getElementById("filesList");
  list.innerHTML = "";
  filesState.textContent = `${files.length} files loaded`;

  for (const file of files) {
    const item = document.createElement("li");
    const displayName = file.name.split("/").pop();

    const copy = document.createElement("div");
    copy.className = "file-copy";
    copy.innerHTML = `<div class="file-name">${displayName}</div><div class="file-meta">${file.isActive ? "Running on printer" : "Stored on printer"}</div>`;

    const actions = document.createElement("div");
    actions.className = "file-actions";

    const startButton = document.createElement("button");
    startButton.type = "button";
    startButton.textContent = "Print";
    startButton.addEventListener("click", () => runAction(`/api/printers/${printerId}/start-file?file_name=${encodeURIComponent(displayName)}`, "POST", `Print started for ${displayName}`));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => runAction(`/api/printers/${printerId}/delete-file?file_name=${encodeURIComponent(displayName)}`, "POST", `Delete sent for ${displayName}`));

    const thumbLink = document.createElement("a");
    thumbLink.className = "link-button";
    thumbLink.href = `/api/printers/${printerId}/file-thumbnail?file_name=${encodeURIComponent(displayName)}`;
    thumbLink.target = "_blank";
    thumbLink.rel = "noreferrer";
    thumbLink.textContent = "Thumb";

    actions.append(startButton, deleteButton, thumbLink);
    item.append(copy, actions);
    list.appendChild(item);
  }
}

async function runAction(url, method, successMessage) {
  setStatus("Working...");
  try {
    await getJson(url, { method });
    setStatus(successMessage);
    await refresh();
  } catch (error) {
    setStatus(error.message);
  }
}

async function uploadFile(event) {
  event.preventDefault();
  const input = document.getElementById("uploadInput");
  const file = input.files?.[0];
  if (!file) {
    document.getElementById("uploadStatus").textContent = "Choose a file first.";
    return;
  }

  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("file_name", file.name);
  formData.append("print_now", String(document.getElementById("printNow").checked));

  document.getElementById("uploadStatus").textContent = `Uploading ${file.name}...`;
  try {
    await getJson(`/api/printers/${printerId}/upload-file`, { method: "POST", body: formData });
    document.getElementById("uploadStatus").textContent = `Uploaded ${file.name}`;
    input.value = "";
    await refresh();
  } catch (error) {
    document.getElementById("uploadStatus").textContent = error.message;
  }
}

document.getElementById("refreshButton").addEventListener("click", refresh);
document.getElementById("pauseButton").addEventListener("click", () => runAction(`/api/printers/${printerId}/pause`, "POST", "Pause sent"));
document.getElementById("resumeButton").addEventListener("click", () => runAction(`/api/printers/${printerId}/resume`, "POST", "Resume sent"));
document.getElementById("uploadForm").addEventListener("submit", uploadFile);

refresh();
