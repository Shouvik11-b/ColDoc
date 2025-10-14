import React from 'react';
import { User } from '../../types/auth';

interface UserPresenceProps {
  activeUsers: Map<number, any>;
  currentUser: User | null;
}

const UserPresence: React.FC<UserPresenceProps> = ({ activeUsers, currentUser }) => {
  const colors = [
    'bg-blue-500',
    'bg-green-500', 
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500'
  ];

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-500">Active users:</span>
      <div className="flex -space-x-2 overflow-hidden">
        {currentUser && (
          <div
            className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-gray-500"
            title={currentUser.name}
          >
            {currentUser.avatar_url ? (
              <img
                className="h-8 w-8 rounded-full"
                src={currentUser.avatar_url}
                alt={currentUser.name}
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-gray-500 flex items-center justify-center text-white text-sm font-medium">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        )}
        
        {Array.from(activeUsers.entries()).map(([userId, userData], index) => (
          <div
            key={userId}
            className={`inline-block h-8 w-8 rounded-full ring-2 ring-white ${colors[index % colors.length]}`}
            title={userData?.name || `User ${userId}`}
          >
            {userData?.avatar_url ? (
              <img
                className="h-8 w-8 rounded-full"
                src={userData.avatar_url}
                alt={userData.name || `User ${userId}`}
              />
            ) : (
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium">
                {userData?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
          </div>
        ))}
      </div>
      
      <span className="text-sm text-gray-500">
        ({activeUsers.size + 1} online)
      </span>
    </div>
  );
};

export default UserPresence;
