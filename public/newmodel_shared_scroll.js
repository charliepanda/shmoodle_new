var socket;
let faceApi;
let detections = [];
let currentColor; // For your brush
let targetColor; // Target color for your brush
let partnerColor; // For partner's brush
let partnerTargetColor; // Target color for partner's brush
let brushSize = 10;
let other = {
  dominantEmotion: 'neutral',
};
let lastScrollTime = 0;
let scrollSpeed = 50; // pixels per second (adjust this value)
let throttleInterval = 20; // Send data every 30ms

let partnerConnected = false; // Track if partner is connected
let roomID; // Unique room ID for each session

// Graphics for drawing
let drawings;

// Video capture
let videoInput;

// Welcome flow variables
let welcomeSteps = [
  "Welcome to version 2.",
  "In this version, you'll notice that the canvas will move slowly to the left.",
  "Try drawing some simple shapes.",
  "Let's invite your partner to the canvas by sending them a link.",
];
let welcomeStepIndex = 0;
let welcomeOverlay;
let nextButton;
let hasDrawn = false;
let welcomeActive = true;
let userCount = 1;

let connectPopup;
let connectButton;
let isInitiator = false; // only user 1 gets the Connect button
let muteButton, clearButton, toast, inviteToast;

let brushInfoLabel, brushInfoHighlight;

// WebRTC variables
let localStream;
let remoteStream;
let peerConnection;
let isMuted = false; // Mute state

// Offscreen canvas for scrolling
let canvasGraphics;

// To track the partner's last position
let partnerLastX = null;
let partnerLastY = null;

// STUN server configuration
const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// Initialize WebRTC and request microphone access
async function initializeWebRTC() {
  try {
    // Get local audio stream with better constraints
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false,
    });

    console.log("Local audio stream acquired:", localStream);

    // Create a new WebRTC peer connection
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Add local audio stream tracks to the peer connection
    localStream.getTracks().forEach((track) => {
      console.log("Adding local track:", track);
      peerConnection.addTrack(track, localStream);
    });

    // Set up remote audio stream
    remoteStream = new MediaStream();
    peerConnection.ontrack = (event) => {
      console.log("Received remote track:", event.track);
      remoteStream.addTrack(event.track);

      // Create and configure remote audio element
      const remoteAudio = new Audio();
      remoteAudio.srcObject = remoteStream;
      remoteAudio.autoplay = true;
      remoteAudio.controls = false;

      // Ensure audio plays when track is received
      remoteAudio.play().catch(error => {
        console.error("Error playing remote audio:", error);
      });

      // Add to DOM to ensure it works across browsers
      document.body.appendChild(remoteAudio);
    };

    // Handle ICE candidates and send them to the server
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Sending ICE candidate:", event.candidate);
        socket.emit("ice-candidate", { candidate: event.candidate, roomID });
      }
    };

    // Monitor connection state
    peerConnection.onconnectionstatechange = () => {
      console.log("Connection state:", peerConnection.connectionState);
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", peerConnection.iceConnectionState);
    };

    console.log("WebRTC initialized");
  } catch (error) {
    console.error("Error initializing WebRTC:", error);
  }
}

// Start the WebRTC call
async function startCall() {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  // Send the offer to the server
  socket.emit('offer', { offer: peerConnection.localDescription, roomID });
  console.log('Offer sent to the server');
}

// Toggle mute/unmute
function toggleMute() {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMuted; // Enable or disable the audio track
  });

  // Update button styles and icon based on mute state
  if (isMuted) {
    muteButton.style('background', 'rgba(255, 255, 255, 1)'); // Solid white background
    muteButton.style('color', 'black'); // Black icon
  } else {
    muteButton.style('background', 'rgba(58,58,58)'); // Transparent white background
    muteButton.style('color', 'white'); // White icon
  }
}


function setup() {
  // Create a full-screen canvas
  createCanvas(windowWidth, windowHeight);
  canvasGraphics = createGraphics(width, height); // Offscreen canvas
  canvasGraphics.background(0); // Black background for the offscreen canvas

  // Initialize video capture
  let videoInput = createCapture(VIDEO);
  videoInput.size(width / 4, height / 4); // Smaller video feed
  videoInput.hide();

  // Initialize ml5 face-api with options
  const faceOptions = {
    withLandmarks: true,
    withExpressions: true,
    withDescriptors: false,
    minConfidence: 0.5,
  };
  faceApi = ml5.faceApi(videoInput, faceOptions, faceReady);

  const params = new URLSearchParams(window.location.search);
  roomID = params.get('room') || Math.random().toString(36).substring(2, 10);
  if (!params.get('room')) {
    window.history.replaceState(null, null, `?room=${roomID}`);
  }

  const isUser1 = !params.get('room'); // true if this user generated the room (i.e., first one)
  isInitiator = isUser1; // Set the isInitiator flag

  socket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    maxReconnectionAttempts: 5
  });

  socket.emit('joinRoom', { roomID });

  // Handle socket reconnection
  socket.on('reconnect', () => {
    console.log('Socket reconnected');
    socket.emit('joinRoom', { roomID });
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    if (reason === 'io server disconnect') {
      socket.connect();
    }
  });


     initializeWebRTC(); // Initialize WebRTC audio

// ───── Invite Toast ─────
// inviteToast = createDiv("You're all alone right now, send the invite link to your friend and Shmoodle together.");
// inviteToast.id('invite-toast');
// inviteToast.style('position', 'absolute');
// inviteToast.style('top', '20px');
// inviteToast.style('left', '50%');
// inviteToast.style('transform', 'translateX(-50%)');
// inviteToast.style('background', 'rgba(58, 58, 58, 0.95)');
// inviteToast.style('color', 'white');
// inviteToast.style('padding', '16px 24px');
// inviteToast.style('border-radius', '8px');
// inviteToast.style('font-size', '16px');
// inviteToast.style('box-shadow', '0 4px 10px rgba(0,0,0,0.3)');
// inviteToast.style('z-index', '20');
// inviteToast.style('display', 'none');

// // ───── Partner Toast ─────
// toast = createDiv();
// toast.id('partner-toast');
// toast.style('position', 'absolute');
// toast.style('top', '20px');
// toast.style('left', '50%');
// toast.style('transform', 'translateX(-50%)');
// toast.style('background', 'rgba(58, 58, 58, 0.95)');
// toast.style('color', 'white');
// toast.style('padding', '16px 24px');
// toast.style('border-radius', '8px');
// toast.style('font-family', "'Karla', sans-serif");
// toast.style('font-size', '16px');
// toast.style('font-weight', '500');
// toast.style('display', 'none');
// toast.style('z-index', '20');
// toast.style('display', 'flex');
// toast.style('align-items', 'center');
// toast.style('gap', '12px');
// toast.style('box-shadow', '0 4px 10px rgba(0,0,0,0.3)');

// const toastText = createDiv('Your partner is online.');
// toastText.parent(toast);
// toastText.style('font-weight', 'bold');
// toastText.style('display', 'inline-block');
// toastText.style('margin-right', '12px');
// toastText.style('padding', '0');

// const startCallBtnInToast = createButton('Start Call');
// startCallBtnInToast.parent(toast);
// startCallBtnInToast.style('padding', '6px 16px');
// startCallBtnInToast.style('background', 'white');
// startCallBtnInToast.style('color', 'black');
// startCallBtnInToast.style('border', 'none');
// startCallBtnInToast.style('border-radius', '4px');
// startCallBtnInToast.style('cursor', 'pointer');
// startCallBtnInToast.mousePressed(() => {
//   startCall();
//   socket.emit('callStarted', { roomID });
//   muteButton.show();
//   toast.hide();
// });

//     socket.on('hideToast', () => {
//   toast.hide();
// });

// socket.on('showMuteButton', () => {
//   muteButton.show();
//   topicButton.show(); // Show topic button after call starts

// });


// const copyLinkButton = createButton('Copy Link');
// copyLinkButton.parent(inviteToast);
// copyLinkButton.style('margin-left', '12px');
// copyLinkButton.style('padding', '6px 16px');
// copyLinkButton.style('background', 'white');
// copyLinkButton.style('color', 'black');
// copyLinkButton.style('border', 'none');
// copyLinkButton.style('border-radius', '4px');
// copyLinkButton.style('cursor', 'pointer');
// copyLinkButton.mousePressed(() => {
//   const script = new URLSearchParams(window.location.search).get('script') || 'newmodel_shared_scroll.js';
//   const link = `${window.location.origin}${window.location.pathname}?script=${script}&room=${roomID}`;
//   navigator.clipboard.writeText(link);
//   copyLinkButton.html('Link Copied!');
// });


  // // Add a button to start the call
  // const callButton = createButton('Start Call');
  // callButton.position(10, 10);
  // callButton.mousePressed(startCall);

// // Create the "Invite Partner" button
// const inviteButton = createButton('Invite Partner');
// inviteButton.addClass('invite-button'); // Apply the CSS class
// inviteButton.position(windowWidth - 160, windowHeight - 60); // Place on the bottom right

// // Add the partner connection text (hidden by default)
// const partnerConnectedText = createDiv('Partner Connected!');
// partnerConnectedText.style('color', 'white');
// partnerConnectedText.style('font-size', '16px');
// partnerConnectedText.style('font-weight', 'bold');
// partnerConnectedText.style('display', 'none'); // Initially hidden
// partnerConnectedText.position(windowWidth - 160, windowHeight - 60); // Same position as the button

// Create invite toast container
  if (!inviteToast) {
    inviteToast = createDiv();
  }
  inviteToast.id("invite-toast");

  // Toast styles
  inviteToast.style("display", "none");
  inviteToast.style("align-items", "center");
  inviteToast.style("gap", "12px");
  inviteToast.style("white-space", "nowrap");
  inviteToast.style("max-width", "90vw");
  inviteToast.style("overflow", "hidden");
  inviteToast.style("background", "rgba(58, 58, 58, 0.95)");
  inviteToast.style("padding", "16px 24px");
  inviteToast.style("border-radius", "8px");
  inviteToast.style("box-shadow", "0 4px 10px rgba(0,0,0,0.3)");
  inviteToast.style("color", "white");
  inviteToast.style("font-family", "Karla, sans-serif");
  inviteToast.style("font-size", "16px");
  inviteToast.style("font-weight", "500");
  inviteToast.style("position", "absolute");
  inviteToast.style("top", "20px");
  inviteToast.style("left", "50%");
  inviteToast.style("transform", "translateX(-50%)");
  inviteToast.style("z-index", "20");

  // Add text inside (IMPORTANT: createSpan)
  const inviteText = createSpan("Your friend left. Invite them back!");
  inviteText.parent(inviteToast);
  inviteText.style("margin", "0");
  inviteText.style("margin-right", "16px");
  inviteText.style("flex-shrink", "0");
  inviteText.style("flex-grow", "1");
  inviteText.style("overflow", "hidden");
  inviteText.style("text-overflow", "ellipsis");
  inviteText.style("white-space", "nowrap");
  inviteText.style("min-width", "0");

  // Button
  const copyLinkButton = createButton("Copy Link");
  copyLinkButton.parent(inviteToast);
  copyLinkButton.addClass("toast-button");
  copyLinkButton.elt.addEventListener("click", (e) => {
    e.stopPropagation();
    const script =
      new URLSearchParams(window.location.search).get("script") ||
      "newmodel_shared_scroll.js";
    const link = `${window.location.origin}${window.location.pathname}?script=${script}&room=${roomID}`;
    navigator.clipboard.writeText(link);
    copyLinkButton.html("Invite Link Copied!");
    copyLinkButton.attribute("disabled", true);
    setTimeout(() => {
      welcomeOverlay.remove();
    }, 3000); // 3000ms = 3 seconds
  });

  // Toast background
  inviteToast.elt.addEventListener("click", (e) => {
    e.stopPropagation();
  });



function showConnectPopup() {
  connectPopup = createDiv();
  connectPopup.id("connect-popup");
  connectPopup.style("position", "absolute");
  connectPopup.style("top", "50%");
  connectPopup.style("left", "50%");
  connectPopup.style("transform", "translate(-50%, -50%)");
  connectPopup.style("background", "rgba(58, 58, 58, 0.95)");
  connectPopup.style("padding", "32px 40px");
  connectPopup.style("border-radius", "12px");
  connectPopup.style("box-shadow", "0 4px 20px rgba(0,0,0,0.35)");
  connectPopup.style("color", "white");
  connectPopup.style("font-family", "Karla, sans-serif");
  connectPopup.style("font-size", "16px");
  connectPopup.style("text-align", "center");
  connectPopup.style("z-index", "100");
  connectPopup.style("line-height", "1.4");
  connectPopup.style("max-width", "360px");

  if (userCount === 2) {
    if (isInitiator) {
      connectPopup.html(`
        <div style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">Your friend just joined!</div>
        <div style="margin-bottom: 20px;">Tap Connect to start drawing and chatting together.</div>
      `);

      connectButton = createButton("Connect");
      connectButton.parent(connectPopup);
      connectButton.style("padding", "8px 20px");
      connectButton.style("font-size", "16px");
      connectButton.style("font-family", "Karla, sans-serif");
      connectButton.style("background", "white");
      connectButton.style("color", "black");
      connectButton.style("border", "none");
      connectButton.style("border-radius", "6px");
      connectButton.style("cursor", "pointer");

      connectButton.mousePressed(async () => {
        socket.emit("clearCanvasForBoth", { roomID });
        connectPopup.remove();

        // Ensure WebRTC is properly initialized before starting call
        if (!localStream || !peerConnection) {
          await initializeWebRTC();
        }

        startCall();
        muteButton.show();
        socket.emit("startCallFromInitiator", { roomID });
        
        // Show audio confirmation toast
        showAudioConfirmationToast();
      });
    } else {
      connectPopup.html(`
        <div style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">Waiting for your friend…</div>
        <div>Your friend will start the session shortly.</div>
      `);
    }
  }
}

// Listen for room status updates
socket.on('roomStatus', (numUsers) => {
  userCount = numUsers;

  if (numUsers > 1) {
    inviteToast.style("display", "none");
    // Only show connect popup if it hasn't been shown before
    if (!connectPopup || connectPopup.removed) {
      showConnectPopup();
    }
    muteButton.show();
    topicButton.show(); // Show topic button when partner joins
  } else {
    muteButton.hide();
    topicButton.hide(); // Hide topic button when alone

    // Only show invite toast if welcome flow is complete and we're truly alone
    if (welcomeOverlay && !welcomeOverlay.removed) return;
    if (!connectPopup || connectPopup.removed) {
      inviteToast.style("display", "flex");
    }
  }
});

  socket.on("clearCanvasNow", () => {
    canvasGraphics.background(0);
  });

  socket.on("startCallFromInitiator", () => {
    if (connectPopup) connectPopup.remove();
    muteButton.show();
  });

  socket.on("startCallNow", () => {
    if (connectPopup) connectPopup.remove();
    showAudioConfirmationToast();
  });

  // Function to show audio confirmation toast
  function showAudioConfirmationToast() {
    const audioToast = createDiv();
    audioToast.id("audio-toast");
    audioToast.style("position", "absolute");
    audioToast.style("top", "20px");
    audioToast.style("left", "50%");
    audioToast.style("transform", "translateX(-50%)");
    audioToast.style("background", "rgba(58, 58, 58, 0.95)");
    audioToast.style("color", "white");
    audioToast.style("padding", "16px 24px");
    audioToast.style("border-radius", "8px");
    audioToast.style("font-family", "'Karla', sans-serif");
    audioToast.style("font-size", "16px");
    audioToast.style("font-weight", "500");
    audioToast.style("z-index", "100");
    audioToast.style("text-align", "center");
    audioToast.style("box-shadow", "0 4px 10px rgba(0,0,0,0.3)");
    audioToast.style("line-height", "1.4");
    audioToast.style("max-width", "400px");

    audioToast.html("You should hear each other now. If you don't, call your partner on your phone and put it on speaker near your computer.");

    const gotItButton = createButton("Got it");
    gotItButton.parent(audioToast);
    gotItButton.style("margin-top", "12px");
    gotItButton.addClass("toast-button");
    gotItButton.mousePressed(() => {
      audioToast.remove();
    });
  }


// // Handle invite partner button click
// inviteButton.mousePressed(() => {
//   // Copy the link to clipboard
//   const script = new URLSearchParams(window.location.search).get('script') || 'newmodel_shared_scroll.js';
//   const roomID = new URLSearchParams(window.location.search).get('room') || 'defaultRoom';
//  // Update the URL with script and roomID
//   const link = `${window.location.origin}${window.location.pathname}?script=${script}&room=${roomID}`;
//   navigator.clipboard.writeText(link);
//   // Change the button text to "Link Copied"
//   inviteButton.html('Link Copied');

//   // Create a temporary text bubble
//   const bubble = createDiv('Share the link with your partner to Shmoodle together.');
//   bubble.style('position', 'absolute');
//   bubble.style('top', `${windowHeight - 120}px`); // Position above the button
//   bubble.style('left', `${windowWidth - 200}px`); // Align horizontally with the button
//   bubble.style('background', 'rgba(58,58,58,1)');
//   bubble.style('color', 'white');
//   bubble.style('padding', '10px');
//   bubble.style('border-radius', '5px');
//   bubble.style('font-size', '14px');
//   bubble.style('box-shadow', '0 0 10px rgba(0,0,0,0.5)');

//   // Remove the bubble and reset button text after 5 seconds
//   setTimeout(() => {
//     bubble.remove();
//     inviteButton.html('Invite Partner');
//   }, 8000);
// });


// Add a button to toggle mute/unmute
muteButton = createButton('<i class="fa-solid fa-microphone-slash"></i>'); // Font Awesome icon
muteButton.position(40, height - 80); // Bottom-left of the screen
muteButton.style('width', '60px');
muteButton.style('height', '60px');
muteButton.style('font-size', '24px'); // Font Awesome size
muteButton.style('background', 'rgba(58,58,58)'); // Initial transparent white background
muteButton.style('color', 'white'); // Initial white icon color
muteButton.style('border', 'none');
muteButton.style('border-radius', '50%'); // Circular button
muteButton.style('display', 'flex');
muteButton.style('align-items', 'center');
muteButton.style('justify-content', 'center');
muteButton.style('cursor', 'pointer');
muteButton.mousePressed(toggleMute);
muteButton.mouseOver(() => (noCanvasInteraction = true)); // Prevent drawing when hovering over the button
muteButton.mouseOut(() => (noCanvasInteraction = false)); // Re-enable drawing
  muteButton.hide();

  // Create topic button in bottom right corner
  const topicButton = createButton('<i class="fa-solid fa-comment"></i>');
  topicButton.position(windowWidth - 80, windowHeight - 80);
  topicButton.style("width", "60px");
  topicButton.style("height", "60px");
  topicButton.style("font-size", "24px");
  topicButton.style("background", "rgba(58,58,58)");
  topicButton.style("color", "white");
  topicButton.style("border", "none");
  topicButton.style("border-radius", "50%");
  topicButton.style("display", "flex");
  topicButton.style("align-items", "center");
  topicButton.style("justify-content", "center");
  topicButton.style("cursor", "pointer");
  topicButton.style("position", "absolute");
  topicButton.hide(); // Initially hidden until call starts

  // Create topic tooltip
  let topicTooltip = createDiv();
  topicTooltip.style("position", "absolute");
  topicTooltip.style("background", "rgba(58, 58, 58, 0.95)");
  topicTooltip.style("color", "white");
  topicTooltip.style("padding", "16px 20px");
  topicTooltip.style("border-radius", "8px");
  topicTooltip.style("font-family", "Karla, sans-serif");
  topicTooltip.style("font-size", "14px");
  topicTooltip.style("line-height", "1.4");
  topicTooltip.style("box-shadow", "0 4px 12px rgba(0,0,0,0.3)");
  topicTooltip.style("display", "none");
  topicTooltip.style("z-index", "100");
  topicTooltip.style("max-width", "300px");

  // Tooltip content
  const tooltipContent = createDiv();
  tooltipContent.parent(topicTooltip);
  tooltipContent.style("margin-bottom", "12px");
  tooltipContent.html("Need something to talk about? Here are some questions:<br><br>• The highlights and challenges of your past week<br>• What has been giving you energy recently<br>• Where and when do you feel the most like yourself recently...");


  // Close button for tooltip
  const closeButton = createButton('X');
  closeButton.parent(topicTooltip);
  closeButton.style("position", "absolute");
  closeButton.style("top", "8px");
  closeButton.style("right", "8px");
  closeButton.style("width", "20px");
  closeButton.style("height", "20px");
  closeButton.style("background", "none");
  closeButton.style("border", "none");
  closeButton.style("color", "white");
  closeButton.style("font-size", "22px");
  closeButton.style("cursor", "pointer");
  closeButton.style("display", "flex");
  closeButton.style("align-items", "center");
  closeButton.style("justify-content", "center");
  closeButton.mousePressed(() => {
    topicTooltip.style("display", "none");
  });

  topicButton.mousePressed(() => {
    // Show the tooltip above the button
    const buttonX = windowWidth - 80;
    const buttonY = windowHeight - 80;
    const x = buttonX - 240; // Position to the left of the button
    const y = buttonY - 180; // Position above the button
    topicTooltip.position(x, y);
    topicTooltip.style("display", "block");
  });

  // Listen for partner's emotion updates and strokes
  socket.on('mouse', (data) => {
    if (data.case === 1) {
      other.dominantEmotion = data.dominantEmotion; // Update partner's emotion
      partnerTargetColor = getEmotionColor(other.dominantEmotion); // Update partner's target color
    } else if (data.case === 3) {
      // Smoothly blend partner's colors
      const scaledOldX = data.oldX * width;
      const scaledOldY = data.oldY * height;
      const scaledX = data.x * width;
      const scaledY = data.y * height;
      partnerColor = lerpColor(partnerColor, partnerTargetColor, 0.05);

      canvasGraphics.stroke(partnerColor);
      canvasGraphics.strokeWeight(brushSize);
      canvasGraphics.line(scaledOldX, scaledOldY, scaledX, scaledY);
    } else if (data.case === 2) {
      // Clear the canvas when partner clears it
      canvasGraphics.background(0);
    }
  });

    // WebRTC signaling listeners
  socket.on("offer", async (data) => {
    if (data.roomID !== roomID) return; // Ignore if it's for another room
    console.log("Received offer:", data.offer);
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.offer),
    );

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Send the answer back to the server
    socket.emit("answer", { answer: peerConnection.localDescription, roomID });
  });

  socket.on("answer", async (data) => {
    if (data.roomID !== roomID) return; // Ignore if it's for another room
    console.log("Received answer:", data.answer);
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.answer),
    );
  });

  socket.on("ice-candidate", async (data) => {
    if (data.roomID !== roomID) return; // Ignore if it's for another room
    console.log("Received ICE candidate:", data.candidate);
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  });


  // Default brush colors
  currentColor = color(255); // Start with white brush
  targetColor = color(255); // Initialize target color
  partnerColor = color(255); // Start with white for partner
  partnerTargetColor = color(255); // Initialize partner's target color

  // Create brush info display
  brushInfoLabel = createDiv();
  brushInfoLabel.style("position", "absolute");
  brushInfoLabel.style("top", "16px");
  brushInfoLabel.style("left", "16px");
  brushInfoLabel.style("padding", "8px 14px");
  brushInfoLabel.style("border-radius", "8px");
  brushInfoLabel.style("font-family", "Karla, sans-serif");
  brushInfoLabel.style("font-size", "18px");
  brushInfoLabel.style("font-weight", "600");
  brushInfoLabel.style("color", "white");
  brushInfoLabel.style("z-index", "30");
  brushInfoLabel.style("display", "inline-flex");
  brushInfoLabel.style("gap", "4px");

  // Static part
  let staticSpan = createSpan("you're coloring with");
  staticSpan.parent(brushInfoLabel);

  // Dynamic color span
  brushInfoHighlight = createSpan(" your emotions.");
  brushInfoHighlight.parent(brushInfoLabel);

  // === 🧁 Multi-Step Welcome Flow ===
  if (userCount === 1 && isUser1) {
    welcomeOverlay = createDiv(welcomeSteps[welcomeStepIndex]);
    welcomeOverlay.id("multi-welcome-toast");
    welcomeOverlay.style("position", "absolute");
    welcomeOverlay.style("top", "20px");
    welcomeOverlay.style("left", "50%");
    welcomeOverlay.style("transform", "translateX(-50%)");
    welcomeOverlay.style("background", "rgba(58, 58, 58, 0.95)");
    welcomeOverlay.style("color", "white");
    welcomeOverlay.style("padding", "16px 24px");
    welcomeOverlay.style("border-radius", "8px");
    welcomeOverlay.style("font-family", "'Karla', sans-serif");
    welcomeOverlay.style("font-size", "16px");
    welcomeOverlay.style("font-weight", "500");
    welcomeOverlay.style("z-index", "100");
    welcomeOverlay.style("text-align", "center");
    welcomeOverlay.style("box-shadow", "0 4px 10px rgba(0,0,0,0.3)");
    welcomeOverlay.style("line-height", "1.4");

    // Button for "Next"
    nextButton = createButton("Next");
    nextButton.parent(welcomeOverlay);
    nextButton.style("margin-top", "12px");
    nextButton.addClass("toast-button");

    nextButton.mousePressed(() => {
      welcomeStepIndex++;

      if (welcomeStepIndex === 2) {
        // "Go ahead and try drawing" step: show toast, wait 6 seconds
        welcomeOverlay.html(welcomeSteps[welcomeStepIndex]);
        welcomeOverlay.child(nextButton);
        nextButton.hide(); // Hide the CTA during this step

        // Delay to auto-advance
        setTimeout(() => {
          welcomeStepIndex++;
          welcomeOverlay.html(welcomeSteps[welcomeStepIndex]);
          welcomeOverlay.child(copyLinkButton);
          copyLinkButton.html("Copy Link");
          copyLinkButton.show(); // Show button again
        }, 6000);
      } else if (welcomeStepIndex === 3) {
        // Final: remove toast and allow drawing
        welcomeOverlay.remove();
        welcomeActive = false;
        inviteToast.show();
      } else {
        welcomeOverlay.html(welcomeSteps[welcomeStepIndex]);
        welcomeOverlay.child(nextButton);
      }
    });
  }
}

function faceReady() {
  faceApi.detect(gotFaces);
}

function gotFaces(error, result) {
  if (error) {
    console.error(error);
    return;
  }

  detections = result;

  // Analyze emotions and update brush color
  updateBrushColor();

  faceApi.detect(gotFaces); // Continue detection
}

function draw() {
  currentColor = lerpColor(currentColor, targetColor, 0.05);

  // Time-based scrolling - consistent across all devices
  let currentTime = millis();
  let deltaTime = currentTime - lastScrollTime;
  
  if (deltaTime >= (1000 / scrollSpeed)) { // Convert pixels/second to milliseconds/pixel
    canvasGraphics.copy(canvasGraphics, 1, 0, width - 1, height, 0, 0, width - 1, height);
    canvasGraphics.fill(0);
    canvasGraphics.noStroke();
    canvasGraphics.rect(width - 1, 0, 1, height);
    lastScrollTime = currentTime;
  }

  // Draw the offscreen canvas on the main canvas
  image(canvasGraphics, 0, 0);

  // Update brush info highlight color
  let r = red(currentColor);
  let g = green(currentColor);
  let b = blue(currentColor);
  brushInfoHighlight.style("color", `rgb(${r}, ${g}, ${b})`);

  // Add local brush strokes
  if (mouseIsPressed) {
    canvasGraphics.stroke(currentColor);
    canvasGraphics.strokeWeight(brushSize);
    canvasGraphics.line(mouseX, mouseY, pmouseX, pmouseY);

    // Emit the new stroke to the server
    socket.emit('mouse', {
      case: 3,
      oldX: pmouseX / width,
      oldY: pmouseY / height,
      x: mouseX / width,
      y: mouseY / height,
      roomID: roomID,
    });
  }
}

function updateBrushColor() {
  if (detections.length > 0) {
    let expressions = detections[0].expressions;

    // Find the dominant emotion
    let dominantEmotion = Object.keys(expressions).reduce((a, b) =>
      expressions[a] > expressions[b] ? a : b
    );

    // Update the target color based on dominant emotion
    targetColor = getEmotionColor(dominantEmotion);

    // Emit the dominant emotion to the server with roomID
    socket.emit('mouse', {
      case: 1,
      dominantEmotion: dominantEmotion,
      roomID: roomID,
    });
  }
}

function getEmotionColor(dominantEmotion) {
  // Set colors for different emotions
  switch (dominantEmotion) {
    case 'happy':
      return color(255, 223, 0); // Yellow
    case 'sad':
      return color(0, 0, 255); // Blue
    case 'angry':
      return color(255, 0, 0); // Red
    case 'surprised':
      return color(176, 0, 255); // Purple
    case 'neutral':
      return color(230, 230, 230); // Light gray
    default:
      return color(255, 0, 0); // red
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  canvasGraphics = createGraphics(width, height);
  canvasGraphics.background(0); // Reset to black background
}
