var socket;
let faceApi;
let detections = [];

let brushInfoLabel, brushInfoHighlight;


// ── New color variables ──
// “self” means this machine’s (your) own facial expression
// “partner” means the partner’s facial expression (received via socket)
let selfBrushColor, selfBrushTargetColor;       // Will be used for remote strokes (i.e. the strokes coming from your partner)
// (Your own facial expression will color the strokes that your partner sees.)
let partnerBrushColor, partnerBrushTargetColor; // Will be used for your local drawing strokes (i.e. the brush you draw with)
// (Your local brush is controlled by your partner’s facial expression.)

let brushSize = 10;
let other = {
  dominantEmotion: 'neutral',
};
let lastSentTime = 0;
let throttleInterval = 20; // Send data every 20ms

let partnerConnected = false; // Track if partner is connected

const canvasWidth = 1440; // Fixed width
const canvasHeight = 821; // Fixed height
let roomID; // Unique room ID for each session

// Graphics for drawing
let drawings;

// Video capture
let videoInput;

// // WebRTC variables
// let localStream;
// let remoteStream;
// let peerConnection;
// let isMuted = false; // Mute state

let clearButton, toast, inviteToast, startCallBtnInToast;
// let connectPopup;
let connectButton;
let isInitiator = false; // only user 1 gets the Connect button
let userCount = 1; // Assume alone until told otherwise

let welcomeSteps = [
  "Welcome to version 3.",
  "In this version, the canvas doesn't move, and your emotions color YOUR PARTNER'S drawings (and vice versa!)",
  "Go ahead and try drawing while smiling 😁",
  "Let's invite your partner to the canvas by sending them a link.",
];
let welcomeStepIndex = 0;
let welcomeOverlay;
let nextButton;
let hasDrawn = false;
let welcomeActive = true;

// STUN server configuration
const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// // Initialize WebRTC and request microphone access
// async function initializeWebRTC() {
//   try {
//     // Get local audio stream
//     localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

//     // Create a new WebRTC peer connection
//     peerConnection = new RTCPeerConnection(rtcConfig);

//     // Add local audio stream tracks to the peer connection
//     localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

//     // Set up remote audio stream
//     remoteStream = new MediaStream();
//     peerConnection.ontrack = (event) => {
//       remoteStream.addTrack(event.track);
//       // Play the remote stream through an audio element
//       const remoteAudio = new Audio();
//       remoteAudio.srcObject = remoteStream;
//       remoteAudio.play();
//     };

//     // Handle ICE candidates and send them to the server
//     peerConnection.onicecandidate = (event) => {
//       if (event.candidate) {
//         socket.emit('ice-candidate', { candidate: event.candidate, roomID });
//       }
//     };

//     console.log('WebRTC initialized');
//   } catch (error) {
//     console.error('Error initializing WebRTC:', error);
//   }
// }

// // Start the WebRTC call
// async function startCall() {
//   const offer = await peerConnection.createOffer();
//   await peerConnection.setLocalDescription(offer);

//   // Send the offer to the server
//   socket.emit('offer', { offer: peerConnection.localDescription, roomID });
//   console.log('Offer sent to the server');
// }

// // Toggle mute/unmute
// function toggleMute() {
//   isMuted = !isMuted;
//   localStream.getAudioTracks().forEach((track) => {
//     track.enabled = !isMuted; // Enable or disable the audio track
//   });

  // Update button styles and icon based on mute state
  // if (isMuted) {
  //   muteButton.style('background', 'rgba(255, 255, 255, 1)'); // Solid white background
  //   muteButton.style('color', 'black'); // Black icon
  // } else {
  //   muteButton.style('background', 'rgba(58,58,58)'); // Transparent white background
  //   muteButton.style('color', 'white'); // White icon
  // }
// }

function setup() {
  // Extract roomID from URL or create a new one
  const params = new URLSearchParams(window.location.search);
  roomID = params.get('room') || Math.random().toString(36).substring(2, 10);
  if (!params.get('room')) {
    // Update the URL with the generated roomID
    window.history.replaceState(null, null, `?room=${roomID}`);
  }

  const isUser1 = !params.get('room'); // true if this user generated the room (i.e., first one)

  // Connect to the socket server
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

  // Create a full-screen canvas
  let canvas = createCanvas(canvasWidth, canvasHeight);
  drawings = createGraphics(canvasWidth, canvasHeight);
  background(0); // Black background

  // Center the canvas
  const xPos = (windowWidth - canvasWidth) / 2;
  const yPos = (windowHeight - canvasHeight) / 2;
  canvas.position(xPos, yPos); // Position the canvas at the center

  // Initialize video capture
  videoInput = createCapture(VIDEO);
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

  // initializeWebRTC(); // Initialize WebRTC audio

  // // Add a button to start the call
  // const callButton = createButton('Start Call');
  // callButton.position(10, 10);
  // callButton.mousePressed(startCall);

  // // Add a button to toggle mute/unmute
  // muteButton = createButton('<i class="fa-solid fa-microphone-slash"></i>');
  // muteButton.position(20, windowHeight - 80);
  // muteButton.style('width', '60px');
  // muteButton.style('height', '60px');
  // muteButton.style('font-size', '24px');
  // muteButton.style('background', 'rgba(58,58,58)');
  // muteButton.style('color', 'white');
  // muteButton.style('border', 'none');
  // muteButton.style('border-radius', '50%');
  // muteButton.style('display', 'flex');
  // muteButton.style('align-items', 'center');
  // muteButton.style('justify-content', 'center');
  // muteButton.style('cursor', 'pointer');
  // muteButton.mousePressed(toggleMute);
  // muteButton.hide();

  // ── Initialize our brush color variables ──
  // These start as white.
  selfBrushColor = color(255);
  selfBrushTargetColor = color(255);
  partnerBrushColor = color(255);
  partnerBrushTargetColor = color(255);

brushInfoLabel = createDiv();
brushInfoLabel.style('position', 'absolute');
brushInfoLabel.style('top', '16px');
brushInfoLabel.style('left', '16px');
brushInfoLabel.style('padding', '8px 14px');
brushInfoLabel.style('border-radius', '8px');
brushInfoLabel.style('font-family', 'Karla, sans-serif');
brushInfoLabel.style('font-size', '18px');
brushInfoLabel.style('font-weight', '600');
//brushInfoLabel.style('background', 'rgba(58, 58, 58, 0.95)');
brushInfoLabel.style('color', 'white');
brushInfoLabel.style('z-index', '30');
brushInfoLabel.style('display', 'inline-flex');
brushInfoLabel.style('gap', '4px');


// Static part
let staticSpan = createSpan("you’re coloring with");
staticSpan.parent(brushInfoLabel);

// Dynamic color span
brushInfoHighlight = createSpan(" your partner’s emotions");
brushInfoHighlight.parent(brushInfoLabel);


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
      "myemo_yourbrush.js";
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

  // function showConnectPopup() {
  //   connectPopup = createDiv();
  //   connectPopup.id("connect-popup");
  //   connectPopup.style("position", "absolute");
  //   connectPopup.style("top", "50%");
  //   connectPopup.style("left", "50%");
  //   connectPopup.style("transform", "translate(-50%, -50%)");
  //   connectPopup.style("background", "rgba(58, 58, 58, 0.95)");
  //   connectPopup.style("padding", "32px 40px");
  //   connectPopup.style("border-radius", "12px");
  //   connectPopup.style("box-shadow", "0 4px 20px rgba(0,0,0,0.35)");
  //   connectPopup.style("color", "white");
  //   connectPopup.style("font-family", "Karla, sans-serif");
  //   connectPopup.style("font-size", "16px");
  //   connectPopup.style("text-align", "center");
  //   connectPopup.style("z-index", "100");
  //   connectPopup.style("line-height", "1.4");
  //   connectPopup.style("max-width", "360px");

  //   if (userCount === 2) {
  //     if (isUser1) {
  //       connectPopup.html(`
  //       <div style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">Your friend just joined!</div>
  //       <div style="margin-bottom: 20px;">Tap Connect to start drawing and chatting together.</div>
  //     `);

  //       connectButton = createButton("Connect");
  //       connectButton.parent(connectPopup);
  //       connectButton.style("padding", "8px 20px");
  //       connectButton.style("font-size", "16px");
  //       connectButton.style("font-family", "Karla, sans-serif");
  //       connectButton.style("background", "white");
  //       connectButton.style("color", "black");
  //       connectButton.style("border", "none");
  //       connectButton.style("border-radius", "6px");
  //       connectButton.style("cursor", "pointer");

  //       connectButton.mousePressed(async () => {
  //         socket.emit("clearCanvasForBoth", { roomID });
  //         connectPopup.remove();

  //         // Ensure WebRTC is properly initialized before starting call
  //         if (!localStream || !peerConnection) {
  //           await initializeWebRTC();
  //         }

  //         startCall();
  //         muteButton.show();
  //         socket.emit("startCallFromInitiator", { roomID });

  //       // Show audio confirmation toast
  //       showAudioConfirmationToast();
  //       });
  //     } else {
  //       connectPopup.html(`
  //       <div style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">Waiting for your friend…</div>
  //       <div>Your friend will start the session shortly.</div>
  //     `);
  //     }
  //   }
  // }

    // callButton.mousePressed(startCall);


  socket.on("clearCanvasNow", () => {
    drawings.clear();
    background(0);
  });

  // socket.on("startCallFromInitiator", () => {
  //   if (connectPopup) connectPopup.remove();
  //   muteButton.show();
  // });

  clearButton = createButton('<i class="fa-duotone fa-solid fa-eraser"></i>');
  clearButton.position(windowWidth - 80, windowHeight - 80);
  clearButton.style('width', '60px');
  clearButton.style('height', '60px');
  clearButton.style('font-size', '24px');
  clearButton.style('background', 'rgba(58,58,58)');
  clearButton.style('color', 'white');
  clearButton.style('border', 'none');
  clearButton.style('border-radius', '50%');
  clearButton.style('display', 'flex');
  clearButton.style('align-items', 'center');
  clearButton.style('justify-content', 'center');
  clearButton.style('cursor', 'pointer');
  clearButton.mousePressed(() => {
    drawings.clear();
    background(0);
    socket.emit('mouse', { case: 2, roomID: roomID });
  });

  const topicButton = createButton('<i class="fa-solid fa-comment"></i>');
  // Position topic button to the left of clear button
  topicButton.position(windowWidth - 160, windowHeight - 80);
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
  topicButton.hide(); // Hide initially

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


  function showPartnerJoinedNotification() {
    const notification = createDiv();
    notification.id("partner-joined-notification");
    notification.style("position", "absolute");
    notification.style("top", "50%");
    notification.style("left", "50%");
    notification.style("transform", "translate(-50%, -50%)");
    notification.style("background", "rgba(58, 58, 58, 0.95)");
    notification.style("padding", "32px 40px");
    notification.style("border-radius", "12px");
    notification.style("box-shadow", "0 4px 20px rgba(0,0,0,0.35)");
    notification.style("color", "white");
    notification.style("font-family", "Karla, sans-serif");
    notification.style("font-size", "18px");
    notification.style("text-align", "center");
    notification.style("z-index", "100");
    notification.style("line-height", "1.4");
    notification.style("max-width", "360px");

    notification.html(`
      <div style="font-size: 22px; font-weight: 600; margin-bottom: 12px;">🎉 Your friend just joined!</div>
      <div>You can now start drawing together.</div>
    `);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      notification.remove();
    }, 4000);
  }
  
  topicButton.mousePressed(() => {
    // Show the tooltip above the button
    const clearBtnX = windowWidth - 80;
    const clearBtnY = windowHeight - 80;
    const x = clearBtnX - 200; // Position to the left of the topic button
    const y = clearBtnY - 180; // Position above the button
    topicTooltip.position(x, y);
    topicTooltip.style("display", "block");
  });

// Listen for room status updates
  socket.on("roomStatus", (numUsers) => {
    userCount = numUsers; // ← Update here

    if (numUsers > 1) {
      partnerConnected = true;
      inviteToast.style("display", "none");
      showPartnerJoinedNotification(); // Show simple notification
      topicButton.show(); // Show topic button when partner joins
      
      // Clear the canvas when partner joins
      drawings.clear();
      background(0);
    } else {
      // Only show invite toast if we had a partner before and now we don't
      if (partnerConnected) {
        inviteToast.style("display", "flex");
      }
      partnerConnected = false;
      topicButton.hide(); // Hide topic button when alone

      if (welcomeOverlay && !welcomeOverlay.removed) return;

      // Don't show invite toast during initial welcome flow
      if (!welcomeActive && userCount === 1) {
        inviteToast.style("display", "flex");
      }
    }
  });

  // socket.on("startCallNow", () => {
  //   if (connectPopup) connectPopup.remove();
  //   muteButton.show();
  // });

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
        // Skip "Go ahead and try drawing" and jump to "invite a friend"
        welcomeStepIndex = 3;
        welcomeOverlay.html(welcomeSteps[welcomeStepIndex]);
        welcomeOverlay.child(copyLinkButton);
        copyLinkButton.html("Copy Link");
        copyLinkButton.show();
      } else if (welcomeStepIndex === 3) {
        // Final: remove toast and allow drawing
        welcomeOverlay.remove();
        welcomeActive = false;
        inviteToast.style("display", "flex");
      } else {
        welcomeOverlay.html(welcomeSteps[welcomeStepIndex]);
        welcomeOverlay.child(nextButton);
      }
    });
  }


  // Listen for partner's emotion updates and strokes
  socket.on('mouse', (data) => {
    if (data.case === 1) {
      // This is a face update from our partner.
      other.dominantEmotion = data.dominantEmotion;
      // Update the brush that controls your own (local) drawing.
      // Your brush (what you draw with) will reflect your partner's facial expression.
      partnerBrushTargetColor = getEmotionColor(other.dominantEmotion);
    } else if (data.case === 3) {
      // These are drawing data from your partner.
      // They will be drawn using your "self" brush color,
      // which is determined by your own facial expression.
      const scaledOldX = data.oldX * canvasWidth;
      const scaledOldY = data.oldY * canvasHeight;
      const scaledX = data.x * canvasWidth;
      const scaledY = data.y * canvasHeight;
      selfBrushColor = lerpColor(selfBrushColor, selfBrushTargetColor, 0.05);
      drawings.stroke(selfBrushColor);
      drawings.strokeWeight(brushSize);
      drawings.line(scaledOldX, scaledOldY, scaledX, scaledY);
    } else if (data.case === 2) {
      // Clear the canvas when partner clears it.
      drawings.clear();
      background(0); // Reset to black
    }
  });

  // // WebRTC signaling listeners
  // socket.on('offer', async (data) => {
  //   if (data.roomID !== roomID) return; // Ignore if it's for another room
  //   console.log('Received offer:', data.offer);
  //   await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

  //   const answer = await peerConnection.createAnswer();
  //   await peerConnection.setLocalDescription(answer);

  //   // Send the answer back to the server
  //   socket.emit('answer', { answer: peerConnection.localDescription, roomID });
  // });

  // socket.on('answer', async (data) => {
  //   if (data.roomID !== roomID) return; // Ignore if it's for another room
  //   console.log('Received answer:', data.answer);
  //   await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  // });

  // socket.on('ice-candidate', async (data) => {
  //   if (data.roomID !== roomID) return; // Ignore if it's for another room
  //   console.log('Received ICE candidate:', data.candidate);
  //   try {
  //     await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  //   } catch (error) {
  //     console.error('Error adding ICE candidate:', error);
  //   }
  // });

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

  // Analyze emotions and send dominant emotion to partner
  if (detections.length > 0) {
    let expressions = detections[0].expressions;
    // Find the dominant emotion
    let dominantEmotion = Object.keys(expressions).reduce((a, b) =>
      expressions[a] > expressions[b] ? a : b
    );
    // Send your dominant emotion to your partner.
    // Your facial expression will determine the color of the strokes
    // that your partner sees (i.e. the remote brush color on their side).
    socket.emit('mouse', {
      case: 1,
      dominantEmotion: dominantEmotion,
      roomID: roomID,
    });
    // Update your own (self) brush target color.
    // (This will be used for drawing strokes coming from your partner on their screen.)
    selfBrushTargetColor = getEmotionColor(dominantEmotion);
  }

  faceApi.detect(gotFaces); // Continue detection
}

function draw() {
  // For your local drawing, use the brush color determined by your partner’s facial expression.
  partnerBrushColor = lerpColor(partnerBrushColor, partnerBrushTargetColor, 0.05);

  if (mouseIsPressed) {
    drawings.stroke(partnerBrushColor);
    drawings.strokeWeight(brushSize);
    drawings.line(mouseX, mouseY, pmouseX, pmouseY);

    // Emit your drawing data to the server.
    // Your partner will draw these strokes using your selfBrushColor
    // (which comes from your own facial expression).
    socket.emit('mouse', {
      case: 3,
      oldX: pmouseX / canvasWidth,
      oldY: pmouseY / canvasHeight,
      x: mouseX / canvasWidth,
      y: mouseY / canvasHeight,
      roomID: roomID,
    });
  }

  // Display the shared drawings
  image(drawings, 0, 0);

  let r = red(partnerBrushColor);
let g = green(partnerBrushColor);
let b = blue(partnerBrushColor);
brushInfoHighlight.style('color', `rgb(${r}, ${g}, ${b})`);

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

// Adjust canvas size on window resize
function windowResized() {
  const xPos = (windowWidth - canvasWidth) / 2;
  const yPos = (windowHeight - canvasHeight) / 2;
  canvas.position(xPos, yPos); // Reposition the canvas to keep it centered


  // Position topic button relative to clear button (to the left)
  const clearBtnX = windowWidth - 80;
  const clearBtnY = windowHeight - 80;
  topicButton.position(clearBtnX - 80, clearBtnY); // 80px to the left of the clear button
}

// function showAudioConfirmationToast() {
//   // Create toast container
//   const audioToast = createDiv();
//   audioToast.id("audio-toast");

//   // Toast styles
//   audioToast.style("display", "flex");
//   audioToast.style("align-items", "center");
//   audioToast.style("gap", "12px");
//   audioToast.style("white-space", "nowrap");
//   audioToast.style("max-width", "90vw");
//   audioToast.style("overflow", "hidden");
//   audioToast.style("background", "rgba(58, 58, 58, 0.95)");
//   audioToast.style("padding", "16px 24px");
//   audioToast.style("border-radius", "8px");
//   audioToast.style("box-shadow", "0 4px 10px rgba(0,0,0,0.3)");
//   audioToast.style("color", "white");
//   audioToast.style("font-family", "Karla, sans-serif");
//   audioToast.style("font-size", "16px");
//   audioToast.style("font-weight", "500");
//   audioToast.style("position", "absolute");
//   audioToast.style("top", "20px");
//   audioToast.style("left", "50%");
//   audioToast.style("transform", "translateX(-50%)");
//   audioToast.style("z-index", "20");

//   // Add text inside (IMPORTANT: createSpan)
//   const audioText = createSpan("You should hear each other now. If you don't, call your partner on your phone and put it on speaker near your computer.");
//   audioText.parent(audioToast);
//   audioText.style("margin", "0");
//   audioText.style("margin-right", "16px");
//   audioText.style("flex-shrink", "0");
//   audioText.style("flex-grow", "1");
//   audioText.style("overflow", "hidden");
//   audioText.style("text-overflow", "ellipsis");
//   audioText.style("white-space", "nowrap");
//   audioText.style("min-width", "0");

//   // Button
//   const gotItButton = createButton("Got it.");
//   gotItButton.parent(audioToast);
//   gotItButton.addClass("toast-button");
//   gotItButton.elt.addEventListener("click", (e) => {
//     e.stopPropagation();
//     audioToast.remove();
//   });

//   // Append toast to body (or another appropriate container)
//   document.body.appendChild(audioToast.elt);

//   // Toast background
//   audioToast.elt.addEventListener("click", (e) => {
//     e.stopPropagation();
//   });
// }
