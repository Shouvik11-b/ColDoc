import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';
import { WebSocketMessage, DocumentOperation } from '../types/websocket';

interface UseWebSocketProps {
  documentId: string;
  onOperation: (operation: DocumentOperation) => void;
  onUserJoined: (userId: number) => void;
  onUserLeft: (userId: number) => void;
  onCursorUpdate: (userId: number, position: number) => void;
  onDocumentState: (document: any) => void;
}

export const useWebSocket = ({
  documentId,
  onOperation,
  onUserJoined,
  onUserLeft,
  onCursorUpdate,
  onDocumentState,
}: UseWebSocketProps) => {
  const { token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<Set<number>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token || !documentId) return;

    // Connect to WebSocket
    const wsUrl = `ws://localhost:8000/ws/${documentId}?token=${token}`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'operation_applied':
          onOperation(message.operation!);
          break;
          
        case 'user_joined':
          setActiveUsers(prev => new Set(prev).add(message.user_id!));
          onUserJoined(message.user_id!);
          break;
          
        case 'user_left':
          setActiveUsers(prev => {
            const newSet = new Set(prev);
            newSet.delete(message.user_id!);
            return newSet;
          });
          onUserLeft(message.user_id!);
          break;
          
        case 'cursor_position':
          onCursorUpdate(message.user_id!, message.position!);
          break;
          
        case 'document_state':
          onDocumentState(message.document!);
          break;
          
        default:
          console.log('Unknown message type:', message.type);
      }
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    return () => {
      socket.close();
    };
  }, [token, documentId, onOperation, onUserJoined, onUserLeft, onCursorUpdate, onDocumentState]);

  const sendOperation = (operation: DocumentOperation) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'text_operation',
        operation,
      }));
    }
  };

  const sendCursorUpdate = (position: number, selection?: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'cursor_update',
        position,
        selection,
      }));
    }
  };

  const sendTypingIndicator = (isTyping: boolean) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'typing_indicator',
        is_typing: isTyping,
      }));
    }
  };

  return {
    isConnected,
    activeUsers,
    sendOperation,
    sendCursorUpdate,
    sendTypingIndicator,
  };
};
