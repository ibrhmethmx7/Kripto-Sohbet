export interface EncryptedMessage {
  id: string;
  sender: string;
  ciphertext: string;
  iv: string;
  timestamp: number;
}

export interface RoomConfig {
  roomId: string;
  passwordKey: string;
  username: string;
}

export interface ServerMessageResponse {
  id: string;
  sender: string;
  ciphertext: string;
  iv: string;
  timestamp: number;
}
