import { useState, useEffect, useRef, FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Lock,
  Unlock,
  Send,
  RefreshCw,
  Copy,
  Check,
  LogOut,
  Key,
  Shield,
  Trash2,
  User,
  Share2,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  Search,
  Image,
  Mic,
  Square,
  X
} from "lucide-react";
import { RoomConfig, EncryptedMessage } from "./types";
import { encryptMessage, decryptMessage } from "./cryptoUtils";

// Notification Audio Synthesizer using Web Audio API
function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const playBeep = (time: number, frequency: number, duration: number) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, time);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.12, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(time);
      osc.stop(time + duration);
    };
    const now = audioCtx.currentTime;
    playBeep(now, 587.33, 0.12); // D5
    playBeep(now + 0.06, 880, 0.18); // A5
  } catch (err) {
    console.error("Ses çalınamadı:", err);
  }
}

// Browser HTML5 Notification Helpers
function requestNotificationPermission(callback: (granted: boolean) => void) {
  if (!("Notification" in window)) {
    alert("Bu tarayıcı bildirimleri desteklemiyor.");
    callback(false);
    return;
  }
  if (Notification.permission === "granted") {
    callback(true);
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((permission) => {
      callback(permission === "granted");
    });
  } else {
    alert("Bildirim izinleri engellenmiş. Tarayıcınızın adres çubuğundaki kilit simgesinden izinleri açabilirsiniz.");
    callback(false);
  }
}

function showBrowserNotification(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body: body,
      tag: "kripto-sohbet-msg",
      renotify: true
    });
  } catch (err) {
    console.error("Bildirim gösterilemedi:", err);
  }
}



interface LocalMessage extends EncryptedMessage {
  text: string;
  decrypted: boolean;
  mediaType: "text" | "image" | "audio";
}

// Random generators
const ADJECTIVES = ["Gizli", "Gölge", "Kripto", "Sessiz", "Anonim", "Kozmik", "Zırhlı", "Derin", "Fantom", "Siber"];
const NOUNS = ["Ajan", "Yolcu", "Gölgelik", "Savaşçı", "Gözcü", "Kurye", "Yazar", "Zihin", "Rehber", "Nokta"];

function generateRandomUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}${noun}${num}`;
}

function generateRandomRoomId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return `oda-${result}`;
}

function generateRandomPassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export default function App() {
  // Config states
  const [roomInput, setRoomInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [usernameInput, setUsernameInput] = useState("");

  const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(null);
  
  // Real-time states
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sseStatus, setSseStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  
  // UI helper states
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [visibleMetaMsgId, setVisibleMetaMsgId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState("");

  const messageEndRef = useRef<HTMLDivElement>(null);

  // UI settings
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Scroll tracking states & refs
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Presence system (Serverless peer online list)
  const [activeUsers, setActiveUsers] = useState<Record<string, number>>({});
  const isHistoryLoadedRef = useRef(false);

  // Advanced features states
  const [reactions, setReactions] = useState<Record<string, Array<{ emoji: string, sender: string }>>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const [currentTheme, setCurrentTheme] = useState<"slate-light" | "slate-dark" | "cyber-neon" | "glassmorphism">(() => {
    return (localStorage.getItem("kripto-sohbet-theme") as any) || "slate-light";
  });

  // Voice recording states & refs
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Check URL query parameters on mount to pre-populate room name and encryption key
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    const keyParam = params.get("key");
    
    if (roomParam) setRoomInput(roomParam);
    if (keyParam) setPasswordInput(keyParam);
    
    // Auto-generate a random username on mount
    setUsernameInput(generateRandomUsername());
  }, []);

  // Set up EventSource for real-time room streaming via ntfy.sh
  useEffect(() => {
    if (!roomConfig) return;

    setSseStatus("connecting");
    isHistoryLoadedRef.current = false;

    // After 3 seconds, mark history as loaded to prevent playing sound for past messages
    const historyTimer = setTimeout(() => {
      isHistoryLoadedRef.current = true;
    }, 3000);

    const eventSource = new EventSource(`https://ntfy.sh/${roomConfig.roomId}/sse?since=all`);

    eventSource.onopen = () => {
      setSseStatus("connected");
      setErrorText("");
    };

    eventSource.onmessage = async (event) => {
      try {
        const ntfyData = JSON.parse(event.data);
        if (ntfyData.event !== "message") return; // skip open/keepalive

        const payload = JSON.parse(ntfyData.message);
        
        if (payload.type === "message") {
          const plainTextRaw = await decryptMessage(payload.message.ciphertext, payload.message.iv, roomConfig.passwordKey);
          
          let text = plainTextRaw;
          let mediaType: "text" | "image" | "audio" = "text";
          
          try {
            const parsed = JSON.parse(plainTextRaw);
            if (parsed && typeof parsed === "object" && "mediaType" in parsed) {
              text = parsed.text;
              mediaType = parsed.mediaType;
            }
          } catch {
            // Keep text as plain text (backward compatibility)
          }
          
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.message.id)) return prev;
            const updated = [
              ...prev,
              {
                ...payload.message,
                text,
                mediaType,
                decrypted: !plainTextRaw.startsWith("[Deşifre Edilemedi")
              }
            ];

            // Auto-scroll logic if at the bottom or sent by current user
            const isMe = payload.message.sender === roomConfig.username;
            if (isMe || isAtBottomRef.current) {
              setTimeout(() => {
                scrollToBottom("smooth");
              }, 50);
            }

            // Notification / Sound alert for real-time messages
            if (isHistoryLoadedRef.current && !isMe) {
              if (soundEnabled) {
                playNotificationSound();
              }
              
              let notifyText = text;
              if (mediaType === "image") notifyText = "📷 Fotoğraf gönderdi";
              else if (mediaType === "audio") notifyText = "🎤 Sesli mesaj gönderdi";

              if (notificationsEnabled && document.hidden) {
                showBrowserNotification(
                  `Kripto Sohbet - ${payload.message.sender}`,
                  notifyText
                );
              }
              if (!isAtBottomRef.current) {
                setUnreadCount((prev) => prev + 1);
              }
            }

            return updated.sort((a, b) => a.timestamp - b.timestamp);
          });
        } else if (payload.type === "presence") {
          // Track active users
          setActiveUsers((prev) => ({
            ...prev,
            [payload.username]: Date.now()
          }));
        } else if (payload.type === "typing") {
          setTypingUsers((prev) => {
            const copy = { ...prev };
            if (payload.isTyping) {
              copy[payload.username] = Date.now();
            } else {
              delete copy[payload.username];
            }
            return copy;
          });
        } else if (payload.type === "reaction") {
          setReactions((prev) => {
            const list = prev[payload.messageId] || [];
            const filtered = list.filter((r) => r.sender !== payload.sender);
            return {
              ...prev,
              [payload.messageId]: [...filtered, { emoji: payload.emoji, sender: payload.sender }]
            };
          });
        } else if (payload.type === "clear") {
          setMessages([]);
        }
      } catch (err) {
        console.error("Mesaj alma ve deşifre etme hatası:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE stream hatası. Yeniden bağlanılıyor...", err);
      setSseStatus("disconnected");
    };

    return () => {
      clearTimeout(historyTimer);
      eventSource.close();
    };
  }, [roomConfig, soundEnabled, notificationsEnabled]);

  // Scroll to bottom programmatically
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior
      });
    }
    setUnreadCount(0);
  };

  // Scroll detection handler
  const handleScroll = () => {
    const container = chatContainerRef.current;
    if (!container) return;

    const threshold = 60;
    const isCloseToBottom = 
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    
    isAtBottomRef.current = isCloseToBottom;
    setShowScrollButton(!isCloseToBottom);
    
    if (isCloseToBottom) {
      setUnreadCount(0);
    }
  };

  // Keep scroll focused at the bottom on initial load
  useEffect(() => {
    if (messages.length > 0 && !isHistoryLoadedRef.current) {
      const timer = setTimeout(() => {
        scrollToBottom("auto");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  // Initialize/reset active users state when roomConfig changes
  useEffect(() => {
    if (roomConfig) {
      setActiveUsers({ [roomConfig.username]: Date.now() });
    } else {
      setActiveUsers({});
    }
  }, [roomConfig]);

  // Send periodic presence ping
  useEffect(() => {
    if (!roomConfig) return;

    const sendPresence = async () => {
      try {
        const payload = {
          type: "presence",
          username: roomConfig.username
        };
        await fetch(`https://ntfy.sh/${roomConfig.roomId}`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error("Presence sending failed:", err);
      }
    };

    // Send immediately on join
    sendPresence();

    const interval = setInterval(sendPresence, 20000);
    return () => clearInterval(interval);
  }, [roomConfig]);

  // Prune inactive users
  useEffect(() => {
    if (!roomConfig) return;

    const pruneInterval = setInterval(() => {
      const threshold = Date.now() - 45000;
      setActiveUsers((prev) => {
        const cleaned: Record<string, number> = {};
        let changed = false;
        
        cleaned[roomConfig.username] = Date.now();
        
        for (const [user, time] of Object.entries(prev)) {
          if (user === roomConfig.username) continue;
          if (time > threshold) {
            cleaned[user] = time;
          } else {
            changed = true;
          }
        }
        return changed ? cleaned : prev;
      });
    }, 5000);

    return () => clearInterval(pruneInterval);
  }, [roomConfig]);

  // Notification toggle handler
  const handleToggleNotifications = () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
    } else {
      requestNotificationPermission((granted) => {
        setNotificationsEnabled(granted);
      });
    }
  };

  // Prune typing status older than 5 seconds
  useEffect(() => {
    if (!roomConfig) return;
    const interval = setInterval(() => {
      const threshold = Date.now() - 5000;
      setTypingUsers((prev) => {
        const cleaned = { ...prev };
        let changed = false;
        for (const [user, time] of Object.entries(prev)) {
          if (time < threshold) {
            delete cleaned[user];
            changed = true;
          }
        }
        return changed ? cleaned : prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [roomConfig]);

  const lastTypingTimeRef = useRef<number>(0);
  const typingTimeoutRef = useRef<any>(null);

  const handleInputChange = (val: string) => {
    setInputText(val);
    if (!roomConfig) return;

    const now = Date.now();
    if (now - lastTypingTimeRef.current > 4000) {
      lastTypingTimeRef.current = now;
      sendTypingSignal(true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingSignal(false);
    }, 2500);
  };

  const sendTypingSignal = async (isTyping: boolean) => {
    if (!roomConfig) return;
    try {
      await fetch(`https://ntfy.sh/${roomConfig.roomId}`, {
        method: "POST",
        body: JSON.stringify({
          type: "typing",
          username: roomConfig.username,
          isTyping
        })
      });
    } catch (err) {
      console.error("Typing signal failed:", err);
    }
  };

  // Send reaction event
  const sendReaction = async (messageId: string, emoji: string) => {
    if (!roomConfig) return;
    try {
      // Optimistic local update
      setReactions((prev) => {
        const list = prev[messageId] || [];
        const filtered = list.filter((r) => r.sender !== roomConfig.username);
        return {
          ...prev,
          [messageId]: [...filtered, { emoji, sender: roomConfig.username }]
        };
      });

      const payload = {
        type: "reaction",
        messageId,
        emoji,
        sender: roomConfig.username
      };
      await fetch(`https://ntfy.sh/${roomConfig.roomId}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error("Reaction sending failed:", err);
    }
  };

  // Send media messages (images, audio)
  const sendMediaMessage = async (base64Data: string, mediaType: "image" | "audio") => {
    if (!roomConfig || isSending) return;
    setIsSending(true);
    try {
      const encryptedJson = JSON.stringify({
        text: base64Data,
        mediaType
      });
      const { ciphertext, iv } = await encryptMessage(encryptedJson, roomConfig.passwordKey);
      const messageObj = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sender: roomConfig.username,
        ciphertext,
        iv,
        timestamp: Date.now()
      };
      const payload = {
        type: "message",
        message: messageObj
      };
      await fetch(`https://ntfy.sh/${roomConfig.roomId}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error("Media message sending failed:", err);
      setErrorText("Medya gönderilemedi. Lütfen tekrar deneyin.");
    } finally {
      setIsSending(false);
    }
  };

  // Audio recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        
        // Limit to ~90KB
        if (audioBlob.size > 95000) {
          alert("Ses kaydı çok uzun! Maksimum 15-20 saniye kaydedebilirsiniz.");
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          sendMediaMessage(reader.result as string, "audio");
        };
        reader.readAsDataURL(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev >= 20) { // Limit to 20 seconds
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error("Mikrofon erişim hatası:", err);
      alert("Mikrofon erişim izni verilmedi veya desteklenmiyor.");
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null; // ignore stop event
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
  };

  // Image selection & Canvas compression
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2000000) {
      alert("Seçilen resim çok büyük! Lütfen 2MB'tan küçük bir resim seçin.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max_size = 480; // keep it compact for fast E2EE base64
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > max_size) {
            height *= max_size / width;
            width = max_size;
          }
        } else {
          if (height > max_size) {
            width *= max_size / height;
            height = max_size;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL("image/jpeg", 0.65); // 65% quality compression
        sendMediaMessage(dataUrl, "image");
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Form submit to enter room
  const handleJoinRoom = (e: FormEvent) => {
    e.preventDefault();
    setErrorText("");

    const room = roomInput.trim().toLowerCase();
    const key = passwordInput.trim();
    const username = usernameInput.trim();

    if (!room) {
      setErrorText("Lütfen geçerli bir Oda Adı girin.");
      return;
    }
    if (!key) {
      setErrorText("Şifreleme için bir Ortak Şifre girin.");
      return;
    }
    if (!username) {
      setErrorText("Lütfen bir kullanıcı adı girin.");
      return;
    }

    setRoomConfig({
      roomId: room,
      passwordKey: key,
      username: username
    });
  };

  // Generate safe shareable link
  const copyShareLink = () => {
    if (!roomConfig) return;
    const url = `${window.location.origin}?room=${encodeURIComponent(roomConfig.roomId)}&key=${encodeURIComponent(roomConfig.passwordKey)}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const copyPasswordKey = () => {
    if (!roomConfig) return;
    navigator.clipboard.writeText(roomConfig.passwordKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Send encrypted message via ntfy.sh
  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !roomConfig || isSending) return;

    setIsSending(true);
    const textToSend = inputText;
    setInputText("");

    // Clear typing timeout and stop typing
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTypingSignal(false);

    try {
      // Encrypt completely on the client side inside a JSON metadata envelope
      const encryptedJson = JSON.stringify({
        text: textToSend,
        mediaType: "text"
      });
      const { ciphertext, iv } = await encryptMessage(encryptedJson, roomConfig.passwordKey);

      const messageObj = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sender: roomConfig.username,
        ciphertext,
        iv,
        timestamp: Date.now()
      };

      const payload = {
        type: "message",
        message: messageObj
      };

      const response = await fetch(`https://ntfy.sh/${roomConfig.roomId}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Mesaj sunucuya iletilemedi.");
      }
    } catch (err: any) {
      console.error("Mesaj gönderme hatası:", err);
      setErrorText("Mesaj gönderilemedi. Lütfen bağlantınızı kontrol edin.");
      setInputText(textToSend);
    } finally {
      setIsSending(false);
    }
  };

  // Clear / Self-destruct chat history
  const handleClearHistory = async () => {
    if (!roomConfig) return;
    if (!confirm("Bu odadaki tüm mesaj geçmişi temizlenecektir. Emin misiniz?")) return;

    try {
      const payload = {
        type: "clear"
      };

      const response = await fetch(`https://ntfy.sh/${roomConfig.roomId}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error("Geçmiş silinemedi.");
      }
    } catch (err) {
      console.error("Geçmişi temizleme hatası:", err);
      alert("Oda geçmişi temizlenirken bir hata oluştu.");
    }
  };

  // Helper to format timestamps nicely
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };

  const themeStyles = {
    "slate-light": {
      bg: "bg-[#fdfdfd] text-[#1a1a1a]",
      grid: "bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-40",
      card: "bg-white border border-gray-100 shadow-sm",
      header: "bg-white border border-gray-100 shadow-sm",
      body: "bg-white border-gray-100",
      input: "bg-white border-gray-100 shadow-sm",
      inputText: "bg-gray-50 border border-gray-200 text-gray-900 focus:bg-white placeholder-gray-400 focus:border-indigo-500/50",
      textMuted: "text-gray-500",
      textNormal: "text-gray-800",
      messageMe: "bg-indigo-600 text-white border-transparent",
      messageOther: "bg-gray-100 text-gray-800 border-transparent",
      iconMuted: "text-gray-400",
      btnSecondary: "bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700",
      loginBg: "bg-white border border-gray-100 shadow-sm",
      divider: "border-gray-100",
    },
    "slate-dark": {
      bg: "bg-[#0f172a] text-[#f8fafc]",
      grid: "bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30",
      card: "bg-[#1e293b] border-[#334155] shadow-lg",
      header: "bg-[#1e293b] border border-[#334155] shadow-md",
      body: "bg-[#1e293b] border-[#334155]",
      input: "bg-[#1e293b] border-[#334155] shadow-md",
      inputText: "bg-[#0f172a] border border-[#334155] text-slate-100 focus:bg-[#0f172a] placeholder-slate-500 focus:border-indigo-500/50",
      textMuted: "text-slate-400",
      textNormal: "text-slate-200",
      messageMe: "bg-indigo-600 text-white border-transparent",
      messageOther: "bg-[#334155] text-slate-100 border-transparent",
      iconMuted: "text-slate-500",
      btnSecondary: "bg-[#334155] hover:bg-[#475569] border border-[#475569] text-slate-200",
      loginBg: "bg-[#1e293b] border border-[#334155] shadow-lg",
      divider: "border-[#334155]",
    },
    "cyber-neon": {
      bg: "bg-[#030712] text-[#f3f4f6] shadow-[inset_0_0_80px_rgba(79,70,229,0.05)]",
      grid: "bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20",
      card: "bg-[#0b0f19] border-[#8b5cf6]/20 shadow-[0_0_20px_rgba(139,92,246,0.1)]",
      header: "bg-[#0b0f19] border border-[#8b5cf6]/20 shadow-[0_4px_20px_rgba(139,92,246,0.1)]",
      body: "bg-[#0b0f19] border-[#8b5cf6]/20",
      input: "bg-[#0b0f19] border-[#8b5cf6]/20 shadow-[0_-4px_20px_rgba(139,92,246,0.1)]",
      inputText: "bg-[#030712] border border-[#8b5cf6]/30 text-purple-100 focus:bg-[#030712] placeholder-purple-900/60 focus:border-[#a78bfa]/50 focus:shadow-[0_0_8px_rgba(139,92,246,0.2)]",
      textMuted: "text-purple-450",
      textNormal: "text-purple-100",
      messageMe: "bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-transparent shadow-[0_0_10px_rgba(168,85,247,0.3)]",
      messageOther: "bg-[#1e1b4b] text-[#e0e7ff] border-[#4f46e5]/30",
      iconMuted: "text-purple-800",
      btnSecondary: "bg-[#1e1b4b] hover:bg-[#312e81] border border-[#4f46e5]/30 text-purple-200",
      loginBg: "bg-[#0b0f19] border border-[#8b5cf6]/20 shadow-[0_0_20px_rgba(139,92,246,0.15)]",
      divider: "border-[#8b5cf6]/20",
    },
    "glassmorphism": {
      bg: "bg-gradient-to-tr from-indigo-100 via-purple-50 to-pink-100 animate-gradient text-gray-800",
      grid: "bg-[linear-gradient(to_right,rgba(255,255,255,0.4)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.4)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-70",
      card: "bg-white/70 backdrop-blur-md border-white/40 shadow-xl",
      header: "bg-white/70 backdrop-blur-md border border-white/40 shadow-lg",
      body: "bg-white/50 border-white/30",
      input: "bg-white/70 backdrop-blur-md border-white/40 shadow-lg",
      inputText: "bg-white/50 border border-white/50 text-gray-900 focus:bg-white/90 placeholder-gray-400 focus:border-indigo-500/50",
      textMuted: "text-gray-500",
      textNormal: "text-gray-700",
      messageMe: "bg-indigo-600/90 text-white border-transparent shadow-md",
      messageOther: "bg-white/60 text-gray-800 border border-white/20 shadow-sm",
      iconMuted: "text-gray-400",
      btnSecondary: "bg-white/40 hover:bg-white/60 border border-white/50 text-gray-700 shadow-sm",
      loginBg: "bg-white/80 backdrop-blur-lg border border-white/40 shadow-2xl",
      divider: "border-white/30",
    }
  };

  const style = themeStyles[currentTheme];

  // Local E2EE Search Filter
  const displayedMessages = messages.filter((msg) => {
    if (!searchQuery.trim()) return true;
    return msg.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
           msg.sender.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className={`h-[100dvh] overflow-hidden flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900 relative transition-colors duration-300 ${style.bg}`}>
      
      {/* Background elegant grid pattern for minimal look */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${style.grid}`} />

      {/* Main container */}
      <AnimatePresence mode="wait">
        {!roomConfig ? (
          // ================== ACCESS / CONFIGURATION SCREEN ==================
          <motion.div
            key="login"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex-1 flex items-center justify-center p-4 z-10"
          >
            <div className={`w-full max-w-md rounded-2xl p-6 md:p-8 border transition-all duration-300 ${style.loginBg}`}>
              
              {/* Security Shield Header */}
              <div className="flex flex-col items-center text-center mb-6">
                <div className="p-3 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-full mb-3 shadow-sm">
                  <Shield size={32} />
                </div>
                <h1 className="text-2xl font-bold tracking-tight font-sans">Kripto Sohbet</h1>
                <p className={`text-xs mt-1 max-w-sm ${style.textMuted}`}>
                  Uçtan uca şifreli (E2EE), tamamen gizli ve anlık mesajlaşma platformu. Sunucu mesajlarınızı asla okuyamaz.
                </p>
              </div>

              {/* Informative Security Alert */}
              <div className="mb-6 p-3 bg-gray-50/50 border border-gray-100 rounded-lg text-xs text-gray-600 flex items-start gap-2.5">
                <Info size={16} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Mesajlarınız tarayıcıda <span className="text-indigo-600 font-semibold font-mono">AES-GCM 256-bit</span> ile şifrelenir.
                  Arkadaşınızla aynı <span className="text-indigo-600 font-semibold">Ortak Şifreyi</span> kullanarak mesajları anında deşifre edebilirsiniz.
                </p>
              </div>

              <form onSubmit={handleJoinRoom} className="space-y-4">
                {/* Username Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold flex justify-between items-center">
                    <span>Rumuzunuz (Kullanıcı Adı)</span>
                    <button
                      type="button"
                      onClick={() => setUsernameInput(generateRandomUsername())}
                      className="text-[10px] text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors"
                    >
                      <Sparkles size={10} /> Rastgele Üret
                    </button>
                  </label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      placeholder="Örn: GölgeAjan"
                      className={`w-full pl-9 pr-4 py-2.5 rounded-lg text-sm transition-all font-sans border ${style.inputText}`}
                    />
                  </div>
                </div>

                {/* Room ID Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold flex justify-between items-center">
                    <span>Oda Adı (Oda Kodu)</span>
                    <button
                      type="button"
                      onClick={() => setRoomInput(generateRandomRoomId())}
                      className="text-[10px] text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors"
                    >
                      <Sparkles size={10} /> Rastgele Oluştur
                    </button>
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={roomInput}
                      onChange={(e) => setRoomInput(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                      placeholder="Örn: ozel-sohbet-odasi"
                      className={`w-full pl-9 pr-4 py-2.5 rounded-lg text-sm transition-all font-mono border ${style.inputText}`}
                    />
                  </div>
                </div>

                {/* Private Encryption Password Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold flex justify-between items-center">
                    <span>Ortak Şifreleme Anahtarı</span>
                    <button
                      type="button"
                      onClick={() => setPasswordInput(generateRandomPassword())}
                      className="text-[10px] text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors"
                    >
                      <Sparkles size={10} /> Güçlü Şifre Üret
                    </button>
                  </label>
                  <div className="relative">
                    <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="Şifreleme anahtarını buraya girin..."
                      className={`w-full pl-9 pr-4 py-2.5 rounded-lg text-sm transition-all font-mono border ${style.inputText}`}
                    />
                  </div>
                </div>

                {errorText && (
                  <p className="text-red-500 text-xs text-center font-medium mt-1">
                    {errorText}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm transition-all duration-200 active:scale-[0.98] shadow-sm shadow-indigo-600/10 flex items-center justify-center gap-2 mt-2 cursor-pointer"
                >
                  <Lock size={16} /> Güvenli Giriş Yap
                </button>
              </form>
            </div>
          </motion.div>
        ) : (
          // ================== ACTIVE CHAT ROOM SCREEN ==================
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col max-w-5xl w-full mx-auto p-3 md:p-6 z-10 overflow-hidden h-full"
          >
            {/* Upper Room Header Dashboard */}
            <div className={`rounded-t-2xl p-4 flex flex-col gap-3.5 border-t border-x transition-all duration-300 ${style.header}`}>
              {/* Row 1: Room ID, active users status, and Core action (Çıkış) */}
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg">
                    <Lock size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-md font-bold tracking-tight font-mono">
                        {roomConfig.roomId}
                      </h2>
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full ${
                          sseStatus === "connected"
                            ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                            : sseStatus === "connecting"
                            ? "bg-amber-500 animate-pulse"
                            : "bg-red-500"
                        }`}
                        title={
                          sseStatus === "connected"
                            ? "Canlı bağlantı aktif"
                            : sseStatus === "connecting"
                            ? "Bağlantı kuruluyor..."
                            : "Bağlantı koptu"
                        }
                      />

                      {/* Online Users Count Badges */}
                      <div className="group relative flex items-center gap-1.5 px-2 py-0.5 bg-green-50 border border-green-100 text-green-700 text-[10px] font-semibold rounded-lg cursor-pointer">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        <span>{Object.keys(activeUsers).length} Çevrimiçi</span>
                        
                        {/* Hover dropdown */}
                        <div className="absolute top-full left-0 mt-1 hidden group-hover:block z-50 bg-white border border-gray-100 rounded-xl shadow-lg p-2.5 w-48 text-[#1a1a1a]">
                          <div className="font-bold text-[9px] text-gray-400 uppercase tracking-wider mb-1.5 border-b border-gray-50 pb-1">Çevrimiçi Kullanıcılar</div>
                          <ul className="space-y-1 max-h-32 overflow-y-auto">
                            {Object.keys(activeUsers).map((user) => (
                              <li key={user} className="flex items-center gap-1.5 text-xs font-medium text-gray-700 truncate">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                <span>{user} {user === roomConfig.username ? "(Siz)" : ""}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                    <p className={`text-xs flex items-center gap-1.5 mt-0.5 ${style.textMuted}`}>
                      Rumuz: <span className="text-indigo-600 font-semibold">{roomConfig.username}</span>
                    </p>
                  </div>
                </div>

                {/* Leave room - aligned right in Row 1 */}
                <button
                  onClick={() => setRoomConfig(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <LogOut size={13} />
                  <span>Çıkış</span>
                </button>
              </div>

              {/* Sleek separator line between Row 1 and Row 2 */}
              <div className={`h-px w-full border-t ${style.divider}`} />

              {/* Row 2: Secondary action toolbar (Theme, Search, Share, Password key, and Alert controls) */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full">
                
                {/* Left Side toolbar options: Search & Theme selection */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Search Toggle / Input */}
                  <div className="flex items-center gap-1">
                    {isSearching && (
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Mesajlarda ara..."
                        className={`px-2.5 py-1.5 rounded-lg text-xs outline-none w-28 md:w-36 transition-all border ${style.inputText}`}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSearching(!isSearching);
                        if (isSearching) setSearchQuery("");
                      }}
                      className={`p-1.5 rounded-lg transition-all cursor-pointer border ${style.btnSecondary}`}
                      title="Mesajlarda Ara"
                    >
                      <Search size={15} />
                    </button>
                  </div>

                  {/* Theme Selector */}
                  <select
                    value={currentTheme}
                    onChange={(e: any) => setCurrentTheme(e.target.value)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold cursor-pointer outline-none border transition-all ${style.btnSecondary}`}
                    title="Arayüz temasını değiştir"
                  >
                    <option value="slate-light">☀️ Açık Tema</option>
                    <option value="slate-dark">🌙 Karanlık Tema</option>
                    <option value="cyber-neon">⚡ Cyber Neon</option>
                    <option value="glassmorphism">❄️ Cam Efekti</option>
                  </select>
                </div>

                {/* Right Side toolbar options: Links, Password keys & Toggles */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Share Link Button */}
                  <button
                    onClick={copyShareLink}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${style.btnSecondary}`}
                  >
                    {copiedLink ? (
                      <>
                        <Check size={14} className="text-green-600" />
                        <span>Kopyalandı!</span>
                      </>
                    ) : (
                      <>
                        <Share2 size={14} />
                        <span>Davet Linki</span>
                      </>
                    )}
                  </button>

                  {/* Show Encryption Password Tooltip/Info */}
                  <button
                    onClick={copyPasswordKey}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors font-mono cursor-pointer border ${style.btnSecondary}`}
                    title="Tıklayarak şifreleme anahtarını kopyalayın"
                  >
                    <Key size={13} className="text-indigo-600" />
                    <span className="hidden sm:inline">Şifre:</span>
                    <span className="max-w-[80px] truncate">{roomConfig.passwordKey}</span>
                    {copiedKey ? <Check size={12} className="text-green-600 ml-1" /> : <Copy size={11} className={`${style.iconMuted} ml-1`} />}
                  </button>

                  {/* Sound Toggle */}
                  <button
                    type="button"
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer border ${
                      soundEnabled 
                        ? "bg-indigo-50 border-indigo-150 text-indigo-600 hover:bg-indigo-100/70" 
                        : style.btnSecondary
                    }`}
                    title={soundEnabled ? "Bildirim sesini kapat" : "Bildirim sesini aç"}
                  >
                    {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                  </button>

                  {/* Notifications Toggle */}
                  <button
                    type="button"
                    onClick={handleToggleNotifications}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer border ${
                      notificationsEnabled 
                        ? "bg-indigo-50 border-indigo-150 text-indigo-600 hover:bg-indigo-100/70" 
                        : style.btnSecondary
                    }`}
                    title={notificationsEnabled ? "Masaüstü bildirimlerini kapat" : "Masaüstü bildirimlerini aç"}
                  >
                    {notificationsEnabled ? <Bell size={15} /> : <BellOff size={15} />}
                  </button>

                  {/* Reset room */}
                  <button
                    onClick={handleClearHistory}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer border ${style.btnSecondary} hover:bg-red-50 hover:text-red-600 hover:border-red-100`}
                    title="Geçmişi Tamamen Sıfırla (Kendi Cihazlarında ve Sunucuda)"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

              </div>
            </div>

            {/* Chat Body messages stream */}
            <div 
              ref={chatContainerRef}
              onScroll={handleScroll}
              className={`flex-1 p-4 overflow-y-auto space-y-4 relative border-x ${style.body}`}
            >
              {displayedMessages.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <div className="p-4 bg-indigo-50 rounded-full border border-indigo-100 mb-3 text-indigo-600">
                    <Unlock size={32} />
                  </div>
                  <h3 className="text-sm font-semibold">
                    {searchQuery.trim() ? "Arama Sonucu Bulunamadı" : "Kripto Sohbet Odası Hazır"}
                  </h3>
                  <p className={`text-xs mt-1 max-w-sm leading-relaxed ${style.textMuted}`}>
                    {searchQuery.trim() 
                      ? "Aradığınız kelimeye uygun deşifre edilmiş mesaj bulunamadı."
                      : "Arkadaşınızla paylaştığınız davet linki ve ortak şifre ile buraya bağlanabilirsiniz. Gönderilen tüm mesajlar uçtan uca şifrelenir."
                    }
                  </p>
                  
                  {!searchQuery.trim() && (
                    <button
                      onClick={copyShareLink}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      <Share2 size={13} /> Davet Linkini Kopyala
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {displayedMessages.map((msg) => {
                    const isMe = msg.sender === roomConfig.username;
                    const msgReactions = reactions[msg.id] || [];
                    
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex flex-col max-w-[85%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
                        onMouseEnter={() => setHoveredMessageId(msg.id)}
                        onMouseLeave={() => setHoveredMessageId(null)}
                      >
                        {/* Username tag */}
                        <span className={`text-[11px] font-semibold mb-1 ml-1 px-1 ${style.textMuted}`}>
                          {isMe ? "Siz" : msg.sender}
                        </span>

                        {/* Message box wrapper */}
                        <div className="relative group">
                          
                          {/* Emoji reaction bar on hover */}
                          {hoveredMessageId === msg.id && msg.decrypted && (
                            <div className={`absolute -top-8 z-30 flex items-center gap-1 bg-white border border-gray-150 p-1 rounded-full shadow-md ${
                              isMe ? "right-2" : "left-2"
                            }`}>
                              {["👍", "❤️", "😂", "😮", "😢"].map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => sendReaction(msg.id, emoji)}
                                  className="hover:scale-130 transition-all text-xs px-1.5 py-0.5 cursor-pointer hover:bg-gray-150/40 rounded-full"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Message bubble */}
                          <div
                            className={`p-3 rounded-2xl shadow-sm border transition-all duration-300 ${
                              isMe ? style.messageMe : style.messageOther
                            } ${
                              isMe ? "rounded-tr-none" : "rounded-tl-none"
                            }`}
                          >
                            {/* Rendering based on E2EE Media Type */}
                            {msg.decrypted && msg.mediaType === "image" ? (
                              <div className="max-w-xs overflow-hidden rounded-lg mt-1 mb-1 border border-black/10">
                                <img 
                                  src={msg.text} 
                                  alt="Paylaşılan Resim" 
                                  className="w-full object-cover max-h-60 hover:opacity-90 transition-opacity cursor-zoom-in" 
                                  onClick={() => window.open(msg.text, "_blank")}
                                />
                              </div>
                            ) : msg.decrypted && msg.mediaType === "audio" ? (
                              <div className="mt-1 mb-1 min-w-[210px] flex items-center gap-2 text-xs">
                                <audio src={msg.text} controls className="w-full h-9 rounded-lg opacity-90" />
                              </div>
                            ) : (
                              <p className="text-sm leading-relaxed break-words font-sans whitespace-pre-wrap font-medium">
                                {msg.text}
                              </p>
                            )}

                            {/* Info Pill & Timestamp footer */}
                            <div className={`flex items-center justify-between gap-3 mt-1.5 text-[10px] ${
                              isMe ? "text-indigo-100" : style.textMuted
                            }`}>
                              <span>{formatTime(msg.timestamp)}</span>
                              
                              {/* Toggle Meta details */}
                              <button
                                onClick={() => setVisibleMetaMsgId(visibleMetaMsgId === msg.id ? null : msg.id)}
                                className={`inline-flex items-center gap-0.5 hover:underline font-mono text-[9px] cursor-pointer ${
                                  isMe ? "text-indigo-200" : "text-gray-500 hover:text-indigo-600"
                                }`}
                                title="Şifreli veriyi ve IV parametrelerini gör"
                              >
                                <Lock size={9} />
                                <span>{visibleMetaMsgId === msg.id ? "Gizle" : "Kripto Detay"}</span>
                              </button>
                            </div>
                          </div>

                          {/* Render Reactions list */}
                          {msgReactions.length > 0 && (
                            <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
                              <div className="flex items-center gap-1 bg-white/70 backdrop-blur-sm border border-gray-150 rounded-full px-2 py-0.5 shadow-sm text-[10px] text-gray-700">
                                {Array.from(new Set(msgReactions.map(r => r.emoji))).map((emoji) => (
                                  <span key={emoji} title={msgReactions.filter(r => r.emoji === emoji).map(r => r.sender).join(", ")}>{emoji}</span>
                                ))}
                                <span className="text-gray-400 font-semibold text-[9px] ml-0.5">{msgReactions.length}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Interactive Crypto Details Container (Cyber-security terminal visualizer) */}
                        <AnimatePresence>
                          {visibleMetaMsgId === msg.id && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="w-full mt-2 overflow-hidden text-left"
                            >
                              <div className="p-3 bg-gray-50/50 border border-indigo-100 rounded-xl text-[10px] font-mono text-gray-600 space-y-2 max-w-full overflow-x-auto shadow-sm leading-relaxed">
                                <div className="flex justify-between items-center border-b border-indigo-100/30 pb-1">
                                  <span className="font-bold uppercase text-indigo-700">🔒 UÇTAN UCA ŞİFRELİ PARAMETRELER</span>
                                  <span className="text-[9px] px-1 bg-indigo-50 text-indigo-700 rounded font-bold">AES-GCM-256</span>
                                </div>
                                <div className="space-y-1">
                                  <div>
                                    <span className="text-indigo-600 font-semibold">Gönderen:</span> {msg.sender}
                                  </div>
                                  <div>
                                    <span className="text-indigo-600 font-semibold">Zaman Damgası:</span> {msg.timestamp}
                                  </div>
                                  <div className="break-all whitespace-pre-wrap">
                                    <span className="text-indigo-600 font-semibold">GCM Başlatma Vektörü (IV):</span>
                                    <div className="mt-0.5 p-1 bg-white rounded border border-gray-100 text-[9px] text-gray-700 select-all">
                                      {msg.iv}
                                    </div>
                                  </div>
                                  <div className="break-all whitespace-pre-wrap">
                                    <span className="text-indigo-600 font-semibold">Base64 Şifreli Gövde (Ciphertext):</span>
                                    <div className="mt-0.5 p-1 bg-white rounded border border-gray-100 text-[9px] text-gray-700 select-all">
                                      {msg.ciphertext}
                                    </div>
                                  </div>
                                  <div className="text-[9px] text-indigo-600/70 border-t border-indigo-100/30 pt-1 flex items-center gap-1.5">
                                    <Shield size={10} />
                                    <span>Bütünlük Doğrulandı (GCM Etiketi Geçerli)</span>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              )}
              <div ref={messageEndRef} />

              {/* Floating scroll to bottom button */}
              <AnimatePresence>
                {showScrollButton && (
                  <motion.button
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                    onClick={() => scrollToBottom("smooth")}
                    className="absolute bottom-4 right-4 z-40 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-full shadow-lg hover:shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 border border-indigo-500/20"
                  >
                    {unreadCount > 0 ? (
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                    ) : null}
                    <span>{unreadCount > 0 ? `Yeni Mesaj (${unreadCount})` : "En Alta Git"}</span>
                    <ChevronDown size={14} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Typing Indicators */}
            {Object.keys(typingUsers).filter(u => u !== roomConfig.username).length > 0 && (
              <div className={`px-4 py-1.5 border-x text-[10px] font-mono italic flex items-center gap-1.5 flex-shrink-0 ${style.body} ${style.textMuted}`}>
                <div className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.4s]" />
                </div>
                <span>
                  {Object.keys(typingUsers).filter(u => u !== roomConfig.username).join(", ")} yazıyor...
                </span>
              </div>
            )}

            {/* Chat bottom input area */}
            <div className={`p-4 rounded-b-2xl border-b border-x flex-shrink-0 transition-colors duration-300 ${style.input}`}>
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                
                {/* Media options when not recording */}
                {!isRecording && (
                  <>
                    <label className={`p-3 border rounded-xl flex items-center justify-center transition-all cursor-pointer ${style.btnSecondary}`} title="Resim Gönder">
                      <Image size={16} />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={startRecording}
                      className={`p-3 border rounded-xl flex items-center justify-center transition-all cursor-pointer ${style.btnSecondary}`}
                      title="Sesli Mesaj Gönder"
                    >
                      <Mic size={16} />
                    </button>
                  </>
                )}

                {/* Voice message recording status */}
                {isRecording && (
                  <div className="flex-1 flex items-center justify-between px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-bold">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                      <span>Ses Kaydediliyor ({recordingDuration}s / 20s)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="px-2 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1 cursor-pointer transition-colors text-[10px]"
                        title="Kaydı Gönder"
                      >
                        <Square size={10} />
                        <span>Bitir</span>
                      </button>
                      <button
                        type="button"
                        onClick={cancelRecording}
                        className="px-2 py-1 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center gap-1 cursor-pointer transition-colors text-[10px]"
                        title="Vazgeç"
                      >
                        <X size={10} />
                        <span>İptal</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Text input, hidden while recording */}
                {!isRecording && (
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => handleInputChange(e.target.value)}
                    placeholder="Güvenli, şifreli mesajınızı yazın..."
                    className={`flex-1 rounded-xl px-4 py-3 text-sm outline-none transition-all border ${style.inputText}`}
                    disabled={sseStatus !== "connected"}
                  />
                )}

                <button
                  type="submit"
                  disabled={(!inputText.trim() && !isRecording) || sseStatus !== "connected" || isSending}
                  className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-150 disabled:text-gray-400 text-white font-bold rounded-xl flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed shadow-sm hover:shadow-indigo-600/10 active:scale-95 flex-shrink-0"
                  title="Mesajı şifrele ve gönder"
                >
                  <Send size={16} className={isSending ? "animate-pulse" : ""} />
                </button>
              </form>

              {/* Status Alert or Error Banner */}
              {errorText && (
                <p className="text-red-500 text-xs mt-2 text-center font-medium">
                  {errorText}
                </p>
              )}
              
              <div className={`mt-2.5 flex items-center justify-between text-[11px] ${style.textMuted}`}>
                <div className="flex items-center gap-1.5">
                  <Shield size={12} className="text-indigo-500/70" />
                  <span>Şifreleme modu: <span className="text-indigo-600 font-semibold font-mono">CLIENT AES-GCM (256-bit)</span></span>
                </div>
                <span>Mesajlar sunucuya asla düz metin olarak gitmez.</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
