'use strict';

function insertAfter(referenceNode, newNode) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

function isNextDownloadButton(node) {
  // Used to make sure we don't put multiple download buttons on screen.
  const next = node.nextSibling;
  return next ? next.id === "downloadButton" : false;
}

async function download(id) {
  // We need to construct the m3u8 url from the lecture id
  // We have two possible links depending on the file type: mp4 or m4a. We test both to see if they return a response and use the one that did
  const m3u8Mp4URL = `https://stream.library.utoronto.ca:1935/MyMedia/play/mp4:1/${id}.mp4/chunklist.m3u8`
  const m3u8M4aURL = `https://stream.library.utoronto.ca:1935/MyMedia/play/mp4:1/${id}.m4a/chunklist.m3u8`

  let m3u8URL
  const mp4Res = await fetch(m3u8Mp4URL)
  if (mp4Res.ok) {
    m3u8URL = m3u8Mp4URL
  }
  const m4aRes = await fetch(m3u8M4aURL)
  if (m4aRes.ok) {
    m3u8URL = m3u8M4aURL
  }
  if (!m3u8URL) {
    console.log("Couldn't find m3u8 URL for lecture", id)
    return;
  }

  // Now we send a mesasge to the background script to download the file. The background script will also open a port back to us that gives us progress info
  chrome.runtime.sendMessage({ type: "START_DOWNLOAD", m3u8URL })
}

// Listen for ports being opened
chrome.runtime.onConnect.addListener(port => {
  // console.log("Extension backend opened a port", port)
  if (port.name.split(':=+=:')[0] === "PROGRESS") {
    const m3u8URL = port.name.split(":=+=:")[1]
    port.onMessage.addListener(message => {
      // These will be progress updates from the background script
      if (message.type === "PROGRESS") {
        const { downloadProgress, downloadDone, concatDone } = message
        // Now we need to do the opposite. We need to extract the id from the m3u8 url
        let id
        for (const part of m3u8URL.split('/')) {
          // If this part has .mp4 in it, we know it is the lecture id
          if (part.includes('.mp4') || part.includes('.m4a')) {
            id = part.split('.')[0]
            break
          }
        }
        // console.log(id, "has progress", downloadProgress, downloadDone, concatDone)
        const buttonWrapper = buttons[id][0]
        const button = buttonWrapper.children[0]
        if (button) {
          if (downloadDone) {
            button.innerHTML = "Downloaded"
          } else {
            if (downloadProgress < 0.25 && button.clientWidth > 100) {
              button.innerHTML = `Downloading ${Math.round(downloadProgress*100)}% (Click on the icon in the top right for more info)`
            } else {
              button.innerHTML = `Downloading ${Math.round(downloadProgress*100)}%`
            }
          }
        }
      }
    })
  }
})

const buttons = {} // Stores buttons as { [id]: { elem: [elements], downloading: bool } }

function createUnstyledButton(id) {
  // This creates a flexbox div where the left 2/3 is a download button and the right 1/3 is a link to the downloader site
  const button = document.createElement('div')
  button.id = 'downloadButton'
  button.style.minHeight = "2rem";
  button.style.background = 'rgb(207 232 255)';
  button.style.borderRadius = "0.25rem";
  button.style.color = "rgb(49, 130, 206)";
  button.style.display = 'flex'
  button.style.flexDirection = 'row'
  button.style.alignItems = 'center'
  button.style.justifyContent = 'space-between'
  const downloadButton = document.createElement('buttton')
  downloadButton.style.textAlign = 'center'
  downloadButton.id = 'innerDownloadButton'
  downloadButton.innerHTML = 'Download'
  const linkButton = document.createElement('a')
  linkButton.text = '(Click here to use the website if that didn\'t work)'
  linkButton.href = `http://lectures.engscitools.ca?seed=${id}`
  linkButton.target = "_blank"
  linkButton.style.textAlign = 'center'
  // Now we put these buttons into the button container
  button.appendChild(downloadButton)
  button.appendChild(linkButton)
  // And we style them so that downloadButton takes 2/3 and linkButton takes 1/3
  downloadButton.style.flex = '2'
  linkButton.style.flex = '1'

  downloadButton.onclick = () => {
    download(id);
  }

  return button
}


function checkAndAddIframe(iframe) {
  const r = /(https:\/\/play.library.utoronto.ca\/embed\/)([0-9a-z]+)/
  const arr = iframe.src.match(r)
  if (arr) {
    // console.log("Got id from iframe", arr[2], iframe)
    const id = arr[2]; // This matches the lecture id as seen in the database
    const width = iframe.width;

    const button = createUnstyledButton(id)
    button.style.width = width+"px";
    button.style.border = "none";
    const parent = iframe.parentNode;
    // We edit the parent so the button lies under the iframe. I hope this doesn't have wider effects.
    parent.style.display = "flex";
    parent.style['flex-direction'] = "column";
    if (!isNextDownloadButton(iframe)) {
      insertAfter(iframe, button);
      if (id in buttons) {
        buttons[id].push(button)
      } else {
        buttons[id] = [button]
      }
    }
  }
}

function checkAndAddThumbnail(thumbnail) {
  function addButton(id) {
    const button = createUnstyledButton(id)
    console.log("Created button", thumbnail.parentNode, button)
    button.style.marginRight = '0';
    button.style.background = 'rgb(207 232 255)';
    // The parent of the thumbnail is the actual video so we insert after the parent.
    if (!isNextDownloadButton(thumbnail.parentNode)) {
      insertAfter(thumbnail.parentNode, button);
      if (id in buttons) {
        buttons[id].push(button)
      } else {
        buttons[id] = [button]
      }
    }
  }

  if (!(thumbnail.parentNode && thumbnail.parentNode.classList.contains('video-js'))) {
    // Is this a thumbnail for a video? If not, ignore it.
    return;
  }

  const r1 = /(url\("https:\/\/mymedia.library.utoronto.ca\/api\/download\/thumbnails\/)(.+)(\..+)/
  const r2 = /(url\("https:\/\/mymedia.library.utoronto.ca\/storage\/thumbnails\/)(.+)(\..+)/
  const source1 = thumbnail.style["background-image"]
  const arr = source1.match(r1) || source1.match(r2);
  if (arr) {
    // console.log("Got id from thumbnail", arr[2], source1, thumbnail)
    const id = arr[2]; // This matches the lecture id as seen in the database
    addButton(id);
  } else {
    const source2 = window.location.href;
    const r3 = /(https:\/\/play.library.utoronto.ca\/)(watch\/)?([0-9a-z]+)/
    const r4 = /(https:\/\/mymedia.library.utoronto.ca\/)(play\/)?([0-9a-z]+)/
    const arr = source2.match(r3) || source2.match(r4);
    if (arr) {
      // console.log("Got id from window href", arr[3], source2, thumbnail)
      const id = arr[3];
      addButton(id);
    }
  }
}

function checkAndAddLink(link) {
  const r = /(https:\/\/play.library.utoronto.ca\/)(watch\/|play\/)([0-9a-z]+)/
  const arr = link.href.match(r);
  if(arr) {
    const id = arr[3];

    const button = createUnstyledButton(id)
    button.style.border = "none";
    // console.log("Got id from link", id, link)
    button.onclick = () => {
      download(id);
    }
    if (!isNextDownloadButton(link)) {
      insertAfter(link, button);
      if (id in buttons) {
        buttons[id].push(button)
      } else {
        buttons[id] = [button]
      }
    }
  }
}

function loadDownloadButtons() {
  const iframes = document.getElementsByTagName('iframe');
  for (const iframe of iframes) {
    // We only want to place download buttons under iframes that link to an embeded lecture
    // console.log("Getting id from iframe", iframe)
    checkAndAddIframe(iframe);
  }

  // We look for thumbnails because they directly contain links to the lecture id
  const thumbnails = document.getElementsByClassName('vjs-poster');
  for (const thumbnail of thumbnails) {
    // console.log("Getting id from thumbnail", thumbnail)
    checkAndAddThumbnail(thumbnail);
  }

  // Links might also point to lectures so we place download buttons on those as well.
  const links = document.getElementsByTagName('a');
  for (const link of links) {
    // console.log("Getting id from link", link)
    checkAndAddLink(link);
  }
}

(new MutationObserver(mutations => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach(node => {
      if (node.tagName !== undefined) {
        const tag = node.tagName.toLowerCase();
        if (tag === 'iframe') {
          // console.log("Getting id from iframe", node)
          checkAndAddIframe(node);
        }else if (tag === 'div') {
          // console.log("Getting id from thumbnail", node)
          checkAndAddThumbnail(node);
        } else if (tag == 'a') {
          // console.log("Getting id from link", node)
          checkAndAddLink(node);
        }
      }
    });
  }
})).observe(document.body, {
  attributes: true,
  characterData: true,
  childList: true,
  subtree: true,
  attributeOldValue: true,
  characterDataOldValue: true
});

window.addEventListener('load', function () {
  setTimeout(loadDownloadButtons(), 0); // Event loop quirk. Don't question it. I don't.
//   chrome.storage.sync.clear(function() {
//     var error = chrome.runtime.lastError;
//     if (error) {
//         console.error(error);
//     } else {
//       console.log("Cleared extension data")
//     }
// });
})
