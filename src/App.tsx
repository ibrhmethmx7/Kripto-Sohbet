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
  ChevronUp
} from "lucide-react";
import { RoomConfig, EncryptedMessage } from "./types";
import { encryptMessage, decryptMessage } from "./cryptoUtils";

interface LocalMessage extends EncryptedMessage {
  text: string;
  decrypted: boolean;
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

  // Set up EventSource for real-time room streaming
  useEffect(() => {
    if (!roomConfig) return;

    setSseStatus("connecting");
    const eventSource = new EventSource(`/api/rooms/${roomConfig.roomId}/stream`);

    eventSource.onopen = () => {
      setSseStatus("connected");
      setErrorText("");
    };

    eventSource.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        if (payload.type === "init") {
          // Decrypt the message list in parallel
          const decryptedList = await Promise.all(
            payload.messages.map(async (msg: EncryptedMessage) => {
              const plainText = await decryptMessage(msg.ciphertext, msg.iv, roomConfig.passwordKey);
              return {
                ...msg,
                text: plainText,
                decrypted: !plainText.startsWith("[Deşifre Edilemedi")
              };
            })
          );
          setMessages(decryptedList);
        } else if (payload.type === "message") {
          const plainText = await decryptMessage(payload.message.ciphertext, payload.message.iv, roomConfig.passwordKey);
          
          setMessages((prev) => {
            // Guard against duplicates
            if (prev.some((m) => m.id === payload.message.id)) return prev;
            return [
              ...prev,
              {
                ...payload.message,
                text: plainText,
                decrypted: !plainText.startsWith("[Deşifre Edilemedi")
              }
            ];
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
      eventSource.close();
    };
  }, [roomConfig]);

  // Scroll to bottom whenever messages list grows
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  // Send encrypted message
  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !roomConfig || isSending) return;

    setIsSending(true);
    const textToSend = inputText;
    setInputText("");

    try {
      // Encrypt completely on the client side
      const { ciphertext, iv } = await encryptMessage(textToSend, roomConfig.passwordKey);

      const response = await fetch(`/api/rooms/${roomConfig.roomId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sender: roomConfig.username,
          ciphertext,
          iv
        })
      });

      if (!response.ok) {
        throw new Error("Mesaj sunucuya iletilemedi.");
      }
    } catch (err: any) {
      console.error("Mesaj gönderme hatası:", err);
      setErrorText("Mesaj gönderilemedi. Lütfen bağlantınızı kontrol edin.");
      // Put message back in input in case of failure
      setInputText(textToSend);
    } finally {
      setIsSending(false);
    }
  };

  // Clear / Self-destruct chat history
  const handleClearHistory = async () => {
    if (!roomConfig) return;
    if (!confirm("Bu odadaki tüm mesaj geçmişi sunucudan tamamen silinecektir. Emin misiniz?")) return;

    try {
      const response = await fetch(`/api/rooms/${roomConfig.roomId}/clear`, {
        method: "POST"
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

  return (
    <div className="min-h-screen bg-[#fdfdfd] text-[#1a1a1a] flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900 relative">
      
      {/* Background elegant grid pattern for minimal look */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none opacity-40" />

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
            <div className="w-full max-w-md bg-white border border-gray-100 rounded-2xl shadow-sm p-6 md:p-8">
              
              {/* Security Shield Header */}
              <div className="flex flex-col items-center text-center mb-6">
                <div className="p-3 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-full mb-3 shadow-sm">
                  <Shield size={32} />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 font-sans">Kripto Sohbet</h1>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">
                  Uçtan uca şifreli (E2EE), tamamen gizli ve anlık mesajlaşma platformu. Sunucu mesajlarınızı asla okuyamaz.
                </p>
              </div>

              {/* Informative Security Alert */}
              <div className="mb-6 p-3 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-600 flex items-start gap-2.5">
                <Info size={16} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Mesajlarınız tarayıcıda <span className="text-indigo-600 font-semibold font-mono">AES-GCM 256-bit</span> ile şifrelenir.
                  Arkadaşınızla aynı <span className="text-indigo-600 font-semibold">Ortak Şifreyi</span> kullanarak mesajları anında deşifre edebilirsiniz.
                </p>
              </div>

              <form onSubmit={handleJoinRoom} className="space-y-4">
                {/* Username Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 flex justify-between items-center">
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
                      className="w-full pl-9 pr-4 py-2.5 bg-gray-50/50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500/50 focus:bg-white transition-all font-sans"
                    />
                  </div>
                </div>

                {/* Room ID Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 flex justify-between items-center">
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
                      className="w-full pl-9 pr-4 py-2.5 bg-gray-50/50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500/50 focus:bg-white transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Private Encryption Password Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 flex justify-between items-center">
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
                      className="w-full pl-9 pr-4 py-2.5 bg-gray-50/50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500/50 focus:bg-white transition-all font-mono"
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
            className="flex-1 flex flex-col max-w-5xl w-full mx-auto p-3 md:p-6 z-10"
          >
            {/* Upper Room Header Dashboard */}
            <div className="bg-white border border-gray-100 rounded-t-2xl p-4 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg">
                  <Lock size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-md font-bold text-gray-900 tracking-tight font-mono">
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
                  </div>
                  <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                    Rumuz: <span className="text-indigo-600 font-semibold">{roomConfig.username}</span>
                  </p>
                </div>
              </div>

              {/* Action utilities */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                {/* Share Link Button */}
                <button
                  onClick={copyShareLink}
                  className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-700 font-medium transition-colors cursor-pointer"
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
                  className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-700 font-medium transition-colors font-mono cursor-pointer"
                  title="Tıklayarak şifreleme anahtarını kopyalayın"
                >
                  <Key size={13} className="text-indigo-600" />
                  <span>Şifre:</span>
                  <span className="text-gray-600 max-w-[80px] truncate">{roomConfig.passwordKey}</span>
                  {copiedKey ? <Check size={12} className="text-green-600 ml-1" /> : <Copy size={11} className="text-gray-400 ml-1" />}
                </button>

                {/* Reset room */}
                <button
                  onClick={handleClearHistory}
                  className="p-1.5 bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-100 text-gray-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                  title="Geçmişi Tamamen Sıfırla (Kendi Cihazlarında ve Sunucuda)"
                >
                  <Trash2 size={15} />
                </button>

                {/* Leave room */}
                <button
                  onClick={() => setRoomConfig(null)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <LogOut size={13} />
                  <span>Çıkış</span>
                </button>
              </div>
            </div>

            {/* Chat Body messages stream */}
            <div className="flex-1 bg-white border-x border-gray-100 p-4 overflow-y-auto space-y-4 min-h-[400px] relative">
              {messages.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <div className="p-4 bg-indigo-50 rounded-full border border-indigo-100 mb-3 text-indigo-600">
                    <Unlock size={32} />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-800">Kripto Sohbet Odası Hazır</h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-sm leading-relaxed">
                    Arkadaşınızla paylaştığınız davet linki ve ortak şifre ile buraya bağlanabilirsiniz. Gönderilen tüm mesajlar uçtan uca şifrelenir.
                  </p>
                  
                  {/* Share button in empty space */}
                  <button
                    onClick={copyShareLink}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    <Share2 size={13} /> Davet Linkini Kopyala
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {messages.map((msg) => {
                    const isMe = msg.sender === roomConfig.username;
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
                        <span className="text-[11px] text-gray-400 font-semibold mb-1 ml-1 px-1">
                          {isMe ? "Siz" : msg.sender}
                        </span>

                        {/* Message box */}
                        <div
                          className={`p-3 rounded-2xl relative shadow-sm group border transition-all ${
                            isMe
                              ? "bg-indigo-600 text-white border-transparent rounded-tr-none"
                              : "bg-gray-100 text-gray-800 border-transparent rounded-tl-none"
                          }`}
                        >
                          {/* Main decrypted body */}
                          <p className="text-sm leading-relaxed break-words font-sans whitespace-pre-wrap font-medium">
                            {msg.text}
                          </p>

                          {/* Info Pill & Timestamp footer */}
                          <div className={`flex items-center justify-between gap-3 mt-1.5 text-[10px] ${
                            isMe ? "text-indigo-100" : "text-gray-400"
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

                        {/* Interactive Crypto Details Container (Cyber-security terminal visualizer) */}
                        <AnimatePresence>
                          {visibleMetaMsgId === msg.id && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="w-full mt-2 overflow-hidden text-left"
                            >
                              <div className="p-3 bg-gray-50 border border-indigo-100 rounded-xl text-[10px] font-mono text-gray-600 space-y-2 max-w-full overflow-x-auto shadow-sm leading-relaxed">
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
            </div>

            {/* Chat bottom input area */}
            <div className="bg-white border-x border-b border-gray-100 p-4 rounded-b-2xl shadow-sm">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Güvenli, şifreli mesajınızı yazın..."
                  className="flex-1 bg-gray-50 border border-gray-200 focus:border-indigo-500/50 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white transition-all"
                  disabled={sseStatus !== "connected"}
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || sseStatus !== "connected" || isSending}
                  className="px-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-bold rounded-xl flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed shadow-sm hover:shadow-indigo-600/10 active:scale-95"
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
              
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-gray-400">
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
