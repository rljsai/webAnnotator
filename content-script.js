
const uri = window.location.href.replace(window.location.hash, "");
let mark = false;
let timeDown, timeUp;


function mouseCapture(event) {
  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  if (!sel.toString().length && !isOnItem(event, "note-board")) {
    erasebar();
    return;
  }
  if (isOnItem(event, "wn-btn") && timeUp - timeDown > 500) {
    erasebar();
    injectcb(range);
    window.postMessage({ task: "color-bar" });
    return;
  } else if (isOnItem(event, "wn-btn", 5)) {
    let id = uuid("T", 10, 16);
    let structItem = structureNode(range);
    structItem["data"] = null;
    erasebar();
    injectnote(range, id);
    markRender(id, "wn_comment", "", dfsNodes(range));
    window.postMessage({ task: "comment-buttons" });
    saveSync("new", structItem, id);
    return;
  } else if (
    isOnItem(event, "note-bar") ||
    isOnItem(event, "color-bar") ||
    isOnItem(event, "note-board")
  ) {
   
    return;
  }
  let state = stateJudge(range);
  erasebar();
  injectbar(range, state);
  window.postMessage({ task: "note-bar" });
}


function respButton(data) {
  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  let structItem = structureNode(range);
  let nodes = dfsNodes(range);

  if (data["switch"] === "false") {
    const id = uuid(data["wn_msg"][0].toUpperCase(), 10, 16);
    let tp_id = uuid(id[0], 10, 16);
    structItem["data"] = data["data"];
    let ccd = markRender(id, data["wn_msg"], data["data"], nodes); // coincidence check data
    saveSync("new", structItem, id, tp_id, ccd);
  } else {
    let id_list = range.startContainer.parentElement
      .getAttribute("wn_id")
      .split(" ");
    let id = id_list.filter((each) => {
      return each[0] === data["wn_msg"][0].toUpperCase();
    })[0];
    let tp_id = uuid(id[0], 10, 16);
    unmarkRender(id, data["wn_msg"], nodes);
    saveSync("change", structItem, id, tp_id);
  }
  erasebar();
}


function pageRender() {
  const pre_trans = {
    C: "wn_comment",
    H: "hl",
    B: "bold",
    I: "italicize",
    U: "underline",
    S: "strike_through",
  };
  chrome.storage.sync.get(uri, (items) => {
    if (JSON.stringify(items) !== "{}" && items[uri]["mark"]) {
      mark = items[uri]["mark"];
      const data = items[uri]["notes"];
      for (let id in data) {
        const type = pre_trans[id[0]];
        const item = data[id];
        const detail = item["data"];
        let start = antiNode(item["startContainer"]);
        let end = antiNode(item["endContainer"]);
        const range = {
          startContainer: start["node"],
          endContainer: end["node"],
          startOffset: start["offset"],
          endOffset: end["offset"],
        };
        const nodes = dfsNodes(range);
        markRender(id, type, detail, nodes);
      }
    }
    window.postMessage({ task: "comment-click" });
  });
}


function structureNode({
  startContainer: startNode,
  startOffset: startOffset,
  endContainer: endNode,
  endOffset: endOffset,
}) {
 
  let startParent = parentNode(startNode);
  let s_offset = getBroadoffset(startParent["node"], startNode) + startOffset;

  let endParent = parentNode(endNode);
  let e_offset = getBroadoffset(endParent["node"], endNode) + endOffset;

  return {
    startContainer: {
      tagName: startParent["tagName"],
      index: startParent["index"],
      offset: s_offset,
    },
    endContainer: {
      tagName: endParent["tagName"],
      index: endParent["index"],
      offset: e_offset,
    },
  };
}


function antiNode({ tagName, index, offset }) {
  const root = window.document;
  const parent = root.getElementsByTagName(tagName)[index];
  const nodeStack = [parent];
  let curNode = null;
  let startOffset = 0;
  let curOffset = 0;

  while ((curNode = nodeStack.pop())) {
    const children = curNode.childNodes;
    for (let i = children.length - 1; i >= 0; i--) {
      nodeStack.push(children[i]);
    }
    if (curNode.nodeType === 3) {
      startOffset = offset - curOffset;
      curOffset += curNode.textContent.length;
      if (curOffset >= offset) {
        break;
      }
    }
  }
  if (!curNode) {
    curNode = parent;
  }
  return { node: curNode, offset: startOffset };
}


function saveSync(option, data, id, tp_id, ccd) {
  chrome.storage.sync.get(uri, (items) => {
    switch (option) {
      case "new":
        if (JSON.stringify(items) !== "{}") {
          items[uri]["notes"][id] = data;
          chrome.storage.sync.set(items, () => {
            console.log(
              `save note(${id[0] == "T" ? "temporary" : "new"} item)`
            );
            ccd && EdgeHandler(ccd, data, tp_id, id);
          });
        } else {
          // no previous record
          let iData = new Object(),
            temp = new Object();
          temp[id] = data;
          iData[uri] = { mark: true, notes: temp };
          chrome.storage.sync.set(iData, () => {
            console.log("save note(new web)");
          });
        }
        break;
      case "change":
        const Item = items[uri]["notes"][id];
        let item = JSON.parse(JSON.stringify(items[uri]["notes"][id]));
        delete item["data"];
        const actions = new Map([
          [
            [item, data],
            () => {
              delete items[uri]["notes"][id];
            },
          ],
          [
            [item["startContainer"], data["startContainer"]],
            () => {
              Item["startContainer"] = data["endContainer"];
            },
          ],
          [
            [item["endContainer"], data["endContainer"]],
            () => {
              Item["endContainer"] = data["startContainer"];
            },
          ],
          [
            [],
            () => {
              let item_cp = JSON.parse(JSON.stringify(Item));
              Item["endContainer"] = data["startContainer"];
              item_cp["startContainer"] = data["endContainer"];
              items[uri]["notes"][tp_id] = item_cp;
              reUpdateId(item_cp, tp_id);
            },
          ],
        ]);
        [...actions].some(([cp_objs, action]) => {
          if (deepCompare(cp_objs[0], cp_objs[1])) {
            action.call(this);
            return true;
          }
        });
        chrome.storage.sync.set(items, () => {
          console.log("modify note");
        });
        break;
      case "delete":
        Object.keys(items[uri]["notes"]).forEach((eid) => {
          eid[0] === "T" && delete items[uri]["notes"][eid];
        });
        id && delete items[uri]["notes"][id];
        chrome.storage.sync.set(items, () => {
          console.log(`delete ${id ? "" : "temporary "}item`);
        });
        break;
      case "rewrite":
      
        item_cp = JSON.parse(JSON.stringify(items[uri]["notes"][id]));
        delete items[uri]["notes"][id];
        item_cp["data"] = data;
        items[uri]["notes"][id.replace("T", "C")] = item_cp;
        chrome.storage.sync.set(items, () => {
          console.log(`rewrite ${id[0] == "T" ? "temporary " : ""}item`);
        });
        break;
    }
  });
}


function EdgeHandler(data, structItem, tp_id, id) {
  chrome.storage.sync.get(uri, (items) => {
    const mapping = new Map([
      ["head", "startContainer"],
      ["tail", "endContainer"],
    ]);
    const ids = Object.keys(items[uri]["notes"]).filter((each) => {
      return (
        each !== id &&
        each[0] === id[0] &&
        items[uri]["notes"][each]["data"] === items[uri]["notes"][id]["data"]
      );
    });
    ids.forEach((each) => {
      let choice = deepCompare(
        items[uri]["notes"][id]["startContainer"],
        items[uri]["notes"][each]["endContainer"]
      )
        ? "head"
        : deepCompare(
            items[uri]["notes"][id]["endContainer"],
            items[uri]["notes"][each]["startContainer"]
          )
        ? "tail"
        : undefined;
      let tp = mapping.get(choice);
      tp &&
        (function () {
          items[uri]["notes"][id][tp] = items[uri]["notes"][each][tp];
          reUpdateId(items[uri]["notes"][each], id);
          delete items[uri]["notes"][each];
        })();
    });
    chrome.storage.sync.set(items, () => {
      console.log("edgehandler done");
      CoincideHandler(data, structItem, tp_id, id);
    });
  });
}


function CoincideHandler(data, structItem, tp_id, id) {

  if (JSON.stringify(data) === "{}") return;

  chrome.storage.sync.get(uri, (items) => {
    function hl() {
      for (let each in data) {
        if (data[each]["sum"] === data[each]["num"]) {
          delete items[uri]["notes"][each];
        } else if (data[each]["before"] && data[each]["after"]) {
          let item_cp = JSON.parse(JSON.stringify(items[uri]["notes"][each]));
          items[uri]["notes"][each]["endContainer"] =
            structItem["startContainer"];
          item_cp["startContainer"] = structItem["endContainer"];
          items[uri]["notes"][tp_id] = item_cp;
          reUpdateId(item_cp, tp_id);
        } else if (data[each]["before"]) {
          items[uri]["notes"][each]["endContainer"] =
            structItem["startContainer"];
        } else if (data[each]["after"]) {
          items[uri]["notes"][each]["startContainer"] =
            structItem["endContainer"];
        }
      }
    }
    function ot() {
      for (let each in data) {
        let delItem = null;
        if (data[each]["sum"] === data[each]["num"]) {
          delete items[uri]["notes"][each];
          break;
        } else if (data[each]["before"] || data[each]["after"]) {
          const mapping = new Map([
            ["before", { sc: each, ec: id, po: "startContainer" }],
            ["after", { sc: id, ec: each, po: "endContainer" }],
          ]);
          let {
            sc: sc_id,
            ec: ec_id,
            po: position,
          } = data[each]["before"]
            ? mapping.get("before")
            : mapping.get("after");
          delItem = {
            startContainer: items[uri]["notes"][sc_id][position],
            endContainer: items[uri]["notes"][ec_id][position],
          };
          items[uri]["notes"][id][position] =
            items[uri]["notes"][each][position];
        }
        reUpdateId(delItem, id);
        delete items[uri]["notes"][each];
      }
    }
    const actions = new Map([
      ["H", hl],
      ["default", ot],
    ]);
    let action = actions.get(id[0]) || actions.get("default");
    action.call(this);
    chrome.storage.sync.set(items, () => {
      console.log("coincidehandler done");
    });
  });
}


function reUpdateId(item, id) {
  let start = antiNode(item["startContainer"]);
  let end = antiNode(item["endContainer"]);
  const range = {
    startContainer: start["node"],
    endContainer: end["node"],
    startOffset: start["offset"],
    endOffset: end["offset"],
  };
  const nodes = dfsNodes(range);
  nodes.forEach((node) => {
    let pe = node.parentElement;
    let wn_id = pe
      .getAttribute("wn_id")
      .replace(new RegExp(id[0] + "\\w+"), id);
    pe.setAttribute("wn_id", wn_id);
  });
}


function parentNode(textNode) {
  let node = textNode;
  while (
    node.parentElement.tagName === "SPAN" &&
    node.parentElement.getAttribute("wn_id")
  ) {
    node = node.parentElement;
  }
  node = node.parentElement;

  const root = window.document;
  const tagName = node.tagName;
  const tagList = root.getElementsByTagName(tagName);

 
  for (let index = 0; index < tagList.length; index++) {
    if (node === tagList[index]) {
      return { node, tagName, index };
    }
  }
  return { node, tagName, index: -1 };
}


function getBroadoffset(parentNode, textNode) {
  const nodeStack = [parentNode];
  let curNode = null;
  let offset = 0;

  while ((curNode = nodeStack.pop())) {
    const children = curNode.childNodes;
    
    for (let i = children.length - 1; i >= 0; i--) {
      nodeStack.push(children[i]);
    }
 
    if (curNode.nodeType === 3 && curNode != textNode) {
      offset += curNode.textContent.length;
    } else if (curNode.nodeType === 3) {
  
      break;
    }
  }
  return offset;
}


function dfsNodes({
  startContainer: startNode,
  startOffset: startOffset,
  endContainer: endNode,
  endOffset: endOffset,
}) {
 
  if (startNode === endNode && startNode.nodeType === 3) {
    if (startNode.length === endOffset - startOffset) {
    
      return [startNode];
    } else if (!startOffset) {

      return [startNode.splitText(endOffset).previousSibling];
    } else if (startNode.length === endOffset) {
 
      return [startNode.splitText(startOffset)];
    }

    startNode.splitText(startOffset);
    let nextNode = startNode.nextSibling;
    nextNode.splitText(endOffset - startOffset);
    return [nextNode];
  }

  let nodeList = []; 
  let resNodes = [];
  let curNode = null;
  let withS = false; 
  let root = window.document; 
  nodeList.push(root);


  while ((curNode = nodeList.pop())) {
    const children = curNode.childNodes;
  
    for (let i = children.length - 1; i >= 0; i--) {
      nodeList.push(children[i]);
    }

   
    if (curNode === startNode && curNode.nodeType === 3) {
      if (!startOffset) {
     
        resNodes.push(curNode);
      } else if (startOffset !== curNode.length) {
        curNode.splitText(startOffset);
  
        resNodes.push(curNode.nextSibling);
      }

      withS = true;
    } else if (curNode === endNode && curNode.nodeType === 3) {
      if (endNode.length !== endOffset) {
        curNode.splitText(endOffset);
      }
  
      resNodes.push(curNode);

      break;
    } else if (withS && curNode.nodeType === 3) {
  
      resNodes.push(curNode);
    }
  }
  return resNodes;
}


function dfsWithoutSplit({ startContainer: startNode, endContainer: endNode }) {
  let nodeList = [];
  let resNodes = [];
  let curNode = null;
  let withS = false;
  let root = window.document;

  if (startNode === endNode) {
    if (startNode.nodeType === 3) {
      resNodes.push(startNode.parentNode);
    }
  } else {
    nodeList.push(root);
    while ((curNode = nodeList.pop())) {
      const children = curNode.childNodes;
      for (let i = children.length - 1; i >= 0; i--) {
        nodeList.push(children[i]);
      }
      if (curNode === startNode) {
        if (curNode.nodeType === 3) {
          resNodes.push(curNode.parentNode);
        }
        withS = true;
      } else if (curNode === endNode) {
        if (curNode.nodeType === 3) {
          resNodes.push(curNode.parentNode);
        }
        break;
      } else if (withS && curNode.nodeType === 3) {
        resNodes.push(curNode.parentNode);
      }
    }
  }
  return resNodes;
}


function stateJudge(range) {
  const resNodes = dfsWithoutSplit(range);
  const types = [
    "wn_comment",
    "hl",
    "bold",
    "italicize",
    "underline",
    "strike_through",
  ];
  let property = {
    wn_comment: false,
    hl: true,
    bold: true,
    italicize: true,
    underline: true,
    strike_through: true,
  };
  let color = null;

  function isMatch(data) {
    return data.every((each) => {
      return types.includes(each);
    });
  }
  for (let node of resNodes) {
    const data = node.className.split(" ");
    if (node.tagName !== "SPAN" || !isMatch(data)) {
      return {
        wn_comment: false,
        hl: false,
        bold: false,
        italicize: false,
        underline: false,
        strike_through: false,
      };
    }
    types.map((each) => {
      if (!data.includes(each)) {
        property[each] = false;
      }
    });
    if (property["hl"]) {
     
      let curColor = node.getAttribute("style").match(/(#\w+)/g)[0];
      if (!(!color ? (color = curColor) : color === curColor)) {
        property["hl"] = false;
      }
    }
  }
  property["color"] = color;
  return property;
}


function clearNotes() {
  chrome.storage.sync.get(uri, (items) => {
    if (JSON.stringify(items) !== "{}") {
      chrome.storage.sync.remove(uri, () => {
        location.reload();
      });
    }
  });
}


function changeMark() {
  chrome.storage.sync.get(uri, (items) => {
    if (JSON.stringify(items) !== "{}") {
      items[uri]["mark"] = mark;
      chrome.storage.sync.set(items, () => {
        location.reload();
        console.log("change mark: " + mark);
      });
    }
  });
}


function markRender(id, type, data, nodes) {
  const pre_style = {
    hl: "background: {0};".format(data || "#FBF3DB"),
    bold: "font-weight:600;",
    italicize: "font-style:italic;",
    underline: "color:inherit;border-bottom:0.05em solid;word-wrap:break-word;",
    strike_through: "text-decoration:line-through;",
    wn_comment:
      "background:rgba(255,212,0,0.14);border-bottom:2px solid rgb(255, 212, 0);padding-bottom:0px;cursor:pointer;",
  };
  let ccd = {}; 

  function NumId([name]) {
    let sum = 0;
    for (let each of document.getElementsByTagName("span")) {
      let ids = each.getAttribute("wn_id");
      ids ? (ids = ids.split(" ")) : (ids = []);
      ids.forEach((e) => {
        if (name === e) sum++;
      });
    }
    return sum;
  }

  nodes.forEach((node, index) => {
    let pe = node.parentElement;
    if (pe.tagName === "SPAN" && pe.getAttribute("wn_id")) {
      let name = pe
        .getAttribute("wn_id")
        .split(" ")
        .filter((each) => {
          return each[0] === id[0];
        });
  
      if (pe.childNodes.length === 1) {
        if (pe.className.split(" ").includes(type)) {
          ccd.hasOwnProperty(name)
            ? (ccd[name]["num"] += 1)
            : (ccd[name] = {
                sum: NumId(name),
                num: 1,
                before: !index ? true : false,
                after: index + 1 === nodes.length ? true : false,
              });
          let wn_id = pe
            .getAttribute("wn_id")
            .replace(new RegExp(id[0] + "\\w+"), id);
          pe.setAttribute("wn_id", wn_id);
          if (type === "hl") {
            let style = pe
              .getAttribute("style")
              .replace(/background: #\w+;/, pre_style["hl"]);
            pe.setAttribute("style", style);
          }
        } else {
        
          pe.className += " {0}".format(type);
          pe.setAttribute(
            "wn_id",
            pe.getAttribute("wn_id") + " {0}".format(id)
          );
          pe.setAttribute("style", pe.getAttribute("style") + pre_style[type]);
        }
      } else {
        if (pe.className.split(" ").includes(type)) {
          ccd.hasOwnProperty(name)
            ? (ccd[name]["after"] = true)
            : (ccd[name] = {
                sum: NumId(name),
                num: 0,
                before: !index ? true : false,
                after: index + 1 === nodes.length ? true : false,
              });
          pe.childNodes.forEach((child) => {
            const wrap = pe.cloneNode(false);
            wrap.appendChild(child.cloneNode(false));
            if (node === child) {
              let wn_id = wrap
                .getAttribute("wn_id")
                .replace(new RegExp(id[0] + "\\w+"), id);
              wrap.setAttribute("wn_id", wn_id);
              if (type === "hl") {
                let style = wrap
                  .getAttribute("style")
                  .replace(/background: #\w+;/, pre_style["hl"]);
                wrap.setAttribute("style", style);
              }
            }
            pe.parentElement.insertBefore(wrap, pe);
          });
          pe.parentElement.removeChild(pe);
        } else {
       
          pe.childNodes.forEach((child) => {
            const wrap = pe.cloneNode(false);
            wrap.appendChild(child.cloneNode(false));
            if (node === child) {
              wrap.className += " {0}".format(type);
              wrap.setAttribute(
                "wn_id",
                wrap.getAttribute("wn_id") + " {0}".format(id)
              );
              wrap.setAttribute(
                "style",
                wrap.getAttribute("style") + pre_style[type]
              );
            }
            pe.parentElement.insertBefore(wrap, pe);
          });
          pe.parentElement.removeChild(pe);
        }
      }
    } else {
     
      const wrap = document.createElement("span");
      wrap.setAttribute("wn_id", id);
      wrap.setAttribute("class", type);
      wrap.setAttribute("style", pre_style[type]);
      wrap.appendChild(node.cloneNode(false));
      pe.replaceChild(wrap, node);
    }
  });
  return ccd;
}


function unmarkRender(id, type, nodes) {
  const pre_style = {
    hl: /background: #\w+;/g,
    bold: "font-weight:600;",
    italicize: "font-style:italic;",
    underline: "color:inherit;border-bottom:0.05em solid;word-wrap:break-word;",
    strike_through: "text-decoration:line-through;",
    wn_comment:
      "background:rgba(255,212,0,0.14);border-bottom:2px solid rgb(255, 212, 0);padding-bottom:0px;cursor:pointer;",
  };


  function hasOtherProperty(node) {
    let id_list = node.getAttribute("wn_id").split(" ");
    return id_list.length !== 1;
  }


  function updateSpan(pe) {
    let ids = pe.getAttribute("wn_id").split(" ");
    let cl = pe.className.split(" ");
    let st = pe.getAttribute("style");

    let ids_new = ids.filter((x) => {
      return x !== id;
    });
    let cl_new = cl.filter((x) => {
      return x !== type;
    });
    pe.setAttribute("wn_id", ids_new.join(" "));
    pe.setAttribute("class", cl_new.join(" "));
    pe.setAttribute("style", st.replace(pre_style[type], ""));
  }

  nodes.forEach((node) => {
    let pe = node.parentElement;
    if (pe.childNodes.length === 1) {
      hasOtherProperty(pe)
        ? updateSpan(pe)
        : pe.parentElement.replaceChild(node, pe);
    } else {
      pe.childNodes.forEach((child) => {
        let wrap = pe.cloneNode(false);
        wrap.appendChild(child.cloneNode(false));
        if (node === child) {
          hasOtherProperty(wrap)
            ? updateSpan(wrap)
            : (wrap = node.cloneNode(false));
        }
        pe.parentElement.insertBefore(wrap, pe);
      });
      pe.parentElement.removeChild(pe);
    }
  });
}


function respComment(raw_data) {
  function addComment(id, data) {
    if (data.length) {
      saveSync("rewrite", data, id);
      let cmts = document.getElementsByClassName("wn_comment");
      [...cmts].forEach((cmt) => {
        let ids = cmt.getAttribute("wn_id");
        cmt.setAttribute("wn_id", ids.replace("T", "C"));
      });
      window.postMessage({ task: "comment-click" });
    } else if (id[0] === "C") {
      deleteComment(id);
    }
    erasebar();
  }

  function deleteComment(id) {
    let cmts = document.getElementsByClassName("wn_comment");
    cmts = [...cmts].filter((cmt) => {
      return cmt.getAttribute("wn_id").match(/C\w{10}/g)[0] == id;
    });
    unmarkRender(
      id,
      "wn_comment",
      cmts.map((e) => {
        return e.childNodes[0];
      })
    );
    saveSync("delete", null, id);
    erasebar();
  }

  function showComment(id) {
    let cmts = document.getElementsByClassName("wn_comment");
    target = [...cmts].filter((cmt) => {
      return cmt.getAttribute("wn_id").match(/C\w{10}/g)[0] == id;
    })[0];
    chrome.storage.sync.get(uri, (items) => {
      let data = items[uri]["notes"][id]["data"];
      injectnote(target, id, data);
      window.postMessage({ task: "comment-buttons" });
    });
  }

  const actions = new Map([
    [
      "add",
      () => {
        addComment(raw_data["id"], raw_data["data"]);
      },
    ],
    [
      "delete",
      () => {
        deleteComment(raw_data["id"]);
      },
    ],
    [
      "show",
      () => {
        showComment(raw_data["id"]);
      },
    ],
  ]);
  let action = actions.get(raw_data["wn_cmt"]);
  action.call(this);
}

function isOnItem(event, className, index) {
  const items = document.getElementsByClassName(className);
  if (!items.length) return false;
  const mouse_x = event.clientX;
  const mouse_y = event.clientY;
  const scope_item = items[index || 0].getBoundingClientRect();
  return (
    mouse_x >= scope_item.left &&
    mouse_x <= scope_item.right &&
    mouse_y >= scope_item.top &&
    mouse_y <= scope_item.bottom
  );
}


function injectbar(range, state) {
  let data = range.getBoundingClientRect();
  // outmost shell
  const container = document.createElement("div");
  container.setAttribute("class", "note-bar");
  container.setAttribute(
    "style",
    "position: absolute; left: {0}px; top: {1}px; z-index: 9999;".format(
      data.left + window.scrollX + 190 > document.body.scrollWidth
        ? document.body.scrollWidth - 190
        : data.left + window.scrollX,
      data.top + window.scrollY - 32 - 8 < 0
        ? data.bottom + window.scrollY + 8
        : data.top + window.scrollY - 32 - 8
    )
  );
  const btn_list = [];
  const msg = [
    "hl",
    "bold",
    "italicize",
    "underline",
    "strike_through",
    "wn_comment",
  ];
  const svg_code = [
    '<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-brightness-high-fill" fill="{0}" xmlns="http://www.w3.org/2000/svg"><path d="M12 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"/><path fill-rule="evenodd" d="M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z"/></svg>'.format(
      state["hl"] ? state["color"] : "currentColor"
    ),
    '<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-type-bold" fill="{0}" xmlns="http://www.w3.org/2000/svg"><path d="M8.21 13c2.106 0 3.412-1.087 3.412-2.823 0-1.306-.984-2.283-2.324-2.386v-.055a2.176 2.176 0 0 0 1.852-2.14c0-1.51-1.162-2.46-3.014-2.46H3.843V13H8.21zM5.908 4.674h1.696c.963 0 1.517.451 1.517 1.244 0 .834-.629 1.32-1.73 1.32H5.908V4.673zm0 6.788V8.598h1.73c1.217 0 1.88.492 1.88 1.415 0 .943-.643 1.449-1.832 1.449H5.907z"/></svg>'.format(
      state["bold"] ? "#2EAADC" : "currentColor"
    ),
    '<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-type-italic" fill="{0}" xmlns="http://www.w3.org/2000/svg"><path d="M7.991 11.674L9.53 4.455c.123-.595.246-.71 1.347-.807l.11-.52H7.211l-.11.52c1.06.096 1.128.212 1.005.807L6.57 11.674c-.123.595-.246.71-1.346.806l-.11.52h3.774l.11-.52c-1.06-.095-1.129-.211-1.006-.806z"/></svg>'.format(
      state["italicize"] ? "#2EAADC" : "currentColor"
    ),
    '<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-type-underline" fill="{0}" xmlns="http://www.w3.org/2000/svg"><path d="M5.313 3.136h-1.23V9.54c0 2.105 1.47 3.623 3.917 3.623s3.917-1.518 3.917-3.623V3.136h-1.23v6.323c0 1.49-.978 2.57-2.687 2.57-1.709 0-2.687-1.08-2.687-2.57V3.136z"/><path fill-rule="evenodd" d="M12.5 15h-9v-1h9v1z"/></svg>'.format(
      state["underline"] ? "#2EAADC" : "currentColor"
    ),
    '<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-type-strikethrough" fill="{0}" xmlns="http://www.w3.org/2000/svg"><path d="M8.527 13.164c-2.153 0-3.589-1.107-3.705-2.81h1.23c.144 1.06 1.129 1.703 2.544 1.703 1.34 0 2.31-.705 2.31-1.675 0-.827-.547-1.374-1.914-1.675L8.046 8.5h3.45c.468.437.675.994.675 1.697 0 1.826-1.436 2.967-3.644 2.967zM6.602 6.5H5.167a2.776 2.776 0 0 1-.099-.76c0-1.627 1.436-2.768 3.48-2.768 1.969 0 3.39 1.175 3.445 2.85h-1.23c-.11-1.08-.964-1.743-2.25-1.743-1.23 0-2.18.602-2.18 1.607 0 .31.083.581.27.814z"/><path fill-rule="evenodd" d="M15 8.5H1v-1h14v1z"/></svg>'.format(
      state["strike_through"] ? "#2EAADC" : "currentColor"
    ),
    '<svg width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M14 1H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.5a2 2 0 0 1 1.6.8L8 14.333 9.9 11.8a2 2 0 0 1 1.6-.8H14a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 0a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2.5a1 1 0 0 1 .8.4l1.9 2.533a1 1 0 0 0 1.6 0l1.9-2.533a1 1 0 0 1 .8-.4H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path d="M5 6a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>',
  ];
  for (let i = 0; i < 6; i++) {
    const btn = document.createElement("button");
    btn.setAttribute("type", "button");
    btn.setAttribute("class", "wn-btn");
    btn.setAttribute("switch", state[msg[i]]);
    btn.setAttribute("value", msg[i]);
    btn.insertAdjacentHTML("beforeend", svg_code[i]);
    btn_list.push(btn);
    container.appendChild(btn);
  }
  document.getElementsByTagName("body")[0].appendChild(container);
}


function erasebar() {
  // erase bar
  const li = ["note-bar", "color-bar", "note-board"];
  for (let className of li) {
    const self = document.getElementsByClassName(className)[0];
    if (self) {
      const parent = self.parentElement;
      parent.removeChild(self);
    }
  }
 
  let cmts = document.getElementsByClassName("wn_comment");
  cmts = [...cmts].filter((cmt) => {
    return cmt.getAttribute("wn_id").includes("T");
  });
  if (cmts.length) {
    saveSync("delete");
    unmarkRender(
      cmts[0].getAttribute("wn_id"),
      "wn_comment",
      cmts.map((e) => {
        return e.childNodes[0];
      })
    );
  }
}


function injectcb(range) {
  let data = range.getBoundingClientRect();
  const container = document.createElement("div");
  container.setAttribute("class", "color-bar");
  container.setAttribute(
    "style",
    "position: absolute; left: {0}px; top: {1}px; z-index: 9999;".format(
      data.left + window.scrollX + 170 > document.body.scrollWidth
        ? document.body.scrollWidth - 170
        : data.left + window.scrollX,
      data.top + window.scrollY - 32 - 8 < 0
        ? data.bottom + window.scrollY + 8
        : data.top + window.scrollY - 32 - 8
    )
  );
  color_list = ["#FFF59D", "#B39DDB", "#B3E5FC", "#A5D6A7", "#Ef9A9A"];
  for (let i = 0; i < 5; i++) {
    const btn = document.createElement("button");
    btn.setAttribute("type", "button");
    btn.setAttribute("class", "color-item");
    btn.setAttribute("value", color_list[i]);
    const item = document.createElement("div");
    item.setAttribute("class", "circle");
    item.setAttribute("style", "background-color:{0};".format(color_list[i]));
    btn.appendChild(item);
    container.appendChild(btn);
  }
  document.getElementsByTagName("body")[0].appendChild(container);
}


function injectnote(range, id, text) {
  function moveCursorToEnd(dom) {
    if (window.getSelection) {
  
      var range = window.getSelection();
      range.selectAllChildren(dom);
      range.collapseToEnd();
    } else if (document.selection) {

      var range = document.selection.createRange();
      range.moveToElementText(dom);
      range.collapse(false);
      range.select();
    }
  }
  let data = range.getBoundingClientRect();
  let left_begin = (data.left + data.right) / 2 + window.scrollX - 180;
  const container = document.createElement("div");
  container.setAttribute("class", "note-board");
  container.setAttribute(
    "style",
    "position: absolute; left: {0}px; top: {1}px; z-index: 9999;border-radius: 3px;background: white;box-shadow: rgba(15, 15, 15, 0.05) 0px 0px 0px 1px, rgba(15, 15, 15, 0.1) 0px 3px 6px, rgba(15, 15, 15, 0.2) 0px 9px 24px;overflow: hidden;animation: popup 0.2s ease-in-out;".format(
      left_begin < 0
        ? 5
        : left_begin + 390 > document.body.scrollWidth
        ? document.body.scrollWidth - 390
        : left_begin,
      data.bottom + window.scrollY + 8
    )
  );
  const cancelbutton =
    '\
        <div role="button" class="wn-dboard" style="user-select: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; white-space: nowrap; height: 28px; border-radius: 3px; box-shadow: rgba(15, 15, 15, 0.1) 0px 0px 0px 1px inset, rgba(15, 15, 15, 0.1) 0px 1px 2px; line-height: 1.2; padding-left: 6px; padding-right: 6px; font-size: 14px; font-weight: 500; margin-left: 8px;">\
            <svg class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="16" height="16">\
                <path d="M842.947458 778.116917 576.847937 512.013303 842.946434 245.883083c8.67559-8.674567 13.447267-20.208251 13.43908-32.477692-0.008186-12.232602-4.7727-23.715121-13.414521-32.332383-8.655124-8.677637-20.149922-13.450337-32.384571-13.4575-12.286838 0-23.808242 4.771677-32.474622 13.434987L512.019443 447.143876 245.88206 181.050496c-8.66331-8.66331-20.175505-13.434987-32.416294-13.434987-12.239765 0-23.75196 4.770653-32.414247 13.43294-8.66024 8.636704-13.428847 20.12434-13.437034 32.356942-0.008186 12.269441 4.76349 23.803125 13.437034 32.476669l266.135336 266.13022L181.050496 778.11794c-8.664334 8.66331-13.43601 20.173458-13.43601 32.41527 0 12.239765 4.7727 23.752983 13.437034 32.417317 8.662287 8.66331 20.173458 13.43294 32.413224 13.43294 12.240789 0 23.754007-4.770653 32.416294-13.43294l266.134313-266.100544 266.101567 266.100544c8.66331 8.66331 20.185738 13.43294 32.4429 13.43294 12.265348-0.008186 23.74889-4.771677 32.369222-13.412474C860.81643 825.081555 860.821547 795.991006 842.947458 778.116917z" p-id="2789"></path>\
            </svg>\
        </div>';
  const textDom = `\
    <div wn_id=${id} style="width: 360px; max-width: 100%; padding: 8px 10px;display: flex; align-items: flex-start; flex-grow: 1;">\
        <div contenteditable="true" spellcheck="true" placeholder="Add a comment…" class="wn-inputboard" style="max-width: 100%; width: 100%;outline: 0; white-space: pre-wrap; word-break: break-word; caret-color: rgb(55, 53, 47); font-size: 14px; margin-top: 3px; margin-bottom: 2px; max-height: 70vh; overflow: hidden auto; min-height: 1em; color: rgb(55, 53, 47); -webkit-text-fill-color: rgba(55, 53, 47, 0.4);">${
          text || ""
        }</div>\
        <div role="button" class="wn-sboard" style="user-select: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; white-space: nowrap; height: 28px; border-radius: 3px; box-shadow: rgba(15, 15, 15, 0.1) 0px 0px 0px 1px inset, rgba(15, 15, 15, 0.1) 0px 1px 2px; line-height: 1.2; padding-left: 12px; padding-right: 12px; font-size: 14px; font-weight: 500; margin-left: 8px;">\
            <svg class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="20px" height="20px">\
                <path d="M276.48 289.877333l20.906667 83.754667a42.666667 42.666667 0 0 1-82.773334 20.736l-42.666666-170.666667a42.666667 42.666667 0 0 1 59.434666-49.066666l640 298.666666a42.666667 42.666667 0 0 1 0 77.354667l-640 298.666667a42.666667 42.666667 0 0 1-59.093333-50.346667l85.333333-298.666667A42.666667 42.666667 0 0 1 298.666667 469.333333h170.666666a42.666667 42.666667 0 0 1 0 85.333334H330.837333l-50.773333 177.792L752.426667 512 276.48 289.877333z" p-id="8613"></path>\
            </svg>\
        </div>\
        ${text ? cancelbutton : ""}
    </div>`;
  container.insertAdjacentHTML("beforeend", textDom);
  document.getElementsByTagName("body")[0].appendChild(container);
  let ele = document.getElementsByClassName("wn-inputboard")[0];
  moveCursorToEnd(ele);
}


function injectjs(jsPath) {
  jsPath = jsPath || "inject.js";
  const temp = document.createElement("script");
  temp.setAttribute("type", "text/javascript");
  temp.src = chrome.runtime.getURL(jsPath);
  (document.head || document.documentElement).appendChild(temp);
}

document.onmousedown = (event) => {
 
  timeDown = getTimeNow();
};

document.onmouseup = (event) => {
 
  timeUp = getTimeNow();
  mark && mouseCapture(event);
};

window.onload = () => {
  injectjs();
  setTimeout(() => {
    pageRender();
  }, 100);
};


chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  const actions = new Map([
    [
      "default",
      () => {
        sendResponse("undefined");
      },
    ],
    [
      "inquire",
      () => {
        sendResponse(mark);
      },
    ],
    [
      "clear",
      () => {
        clearNotes();
        sendResponse("success");
      },
    ],
    [
      "change",
      () => {
        mark = request.mark;
        changeMark();
        sendResponse("success");
      },
    ],
  ]);

  let action = actions.get(request.type) || actions.get("default");
  action.call(this);
});


window.addEventListener("message", (event) => {
  let data = event.data;

  data.hasOwnProperty("wn_msg") && respButton(data);
 
  data.hasOwnProperty("wn_cmt") && respComment(data);
});
