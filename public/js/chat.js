document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- Element References ---
    const chatContainer = document.querySelector('.chat-container');
    const currentUserId = chatContainer.dataset.userId;
    const onlineUsersList = document.getElementById('online-users-list');
    const friendRequestsList = document.getElementById('friend-requests-list');
    const friendsList = document.getElementById('friends-list');
    const chatBox = document.getElementById('chat-box');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message');
    const sendButton = chatForm.querySelector('button');
    const chatWithUsername = document.getElementById('chat-with-username');

    let selectedUser = null;
    let localFriends = [];

    // --- Initial Connection ---
    socket.emit('new user', currentUserId);
    socket.emit('load user data', currentUserId); // Load friends and requests on connect

    // --- Socket Event Handlers ---

    // Load initial friends and friend requests
    socket.on('user data', (data) => {
        localFriends = data.friends.map(f => f.id);
        friendsList.innerHTML = '';
        data.friends.forEach(addFriendToList);

        friendRequestsList.innerHTML = '';
        data.friendRequests.forEach(addRequestToList);
        
        // After getting data, request online status to update friend indicators
        socket.emit('request online friends');
    });

    // Update online status indicators
    socket.on('online users', (onlineUsers) => {
        const onlineUserIds = onlineUsers.map(u => u.id);

        // Update friend list indicators
        document.querySelectorAll('#friends-list li').forEach(li => {
            const friendId = li.dataset.friendId;
            const indicator = li.querySelector('.online-indicator');
            if (onlineUserIds.includes(friendId)) {
                if (!indicator) {
                    const newIndicator = document.createElement('span');
                    newIndicator.className = 'online-indicator';
                    li.prepend(newIndicator);
                }
            } else {
                if (indicator) indicator.remove();
            }
        });

        // Update the general "Online Users" list
        onlineUsersList.innerHTML = '';
        onlineUsers.forEach(user => {
            if (user.id !== currentUserId && !localFriends.includes(user.id)) {
                const li = document.createElement('li');
                li.dataset.userId = user.id;
                li.innerHTML = `<span class="username">${user.username}</span>`;

                const requestBtn = document.createElement('button');
                requestBtn.innerText = '+';
                requestBtn.className = 'action-btn';
                requestBtn.title = 'Send friend request';
                requestBtn.onclick = (e) => {
                    e.stopPropagation();
                    sendFriendRequest(user.id);
                };

                li.appendChild(requestBtn);
                onlineUsersList.appendChild(li);
            }
        });
    });

    // Handle incoming friend requests
    socket.on('new friend request', (request) => {
        addRequestToList(request);
    });

    // Handle accepted friend requests
    socket.on('friend request accepted', (friend) => {
        addFriendToList(friend);
        localFriends.push(friend.id);
        // Remove the original request from the list
        const requestEl = document.getElementById(`request-${friend.id}`);
        if (requestEl) requestEl.remove();
        // Potentially remove user from the public online list
        const onlineUserEl = document.querySelector(`#online-users-list li[data-user-id="${friend.id}"]`);
        if (onlineUserEl) onlineUserEl.remove();
    });
    
    // Handle incoming chat messages
    socket.on('chat message', (msg) => {
        if (isMessageForCurrentChat(msg)) {
            displayMessage(msg);
        }
    });

    // Load chat history
    socket.on('history', (history) => {
        chatBox.innerHTML = '';
        if (history && history.length > 0) {
            history.forEach(msg => {
                if (isMessageForCurrentChat(msg)) {
                    displayMessage(msg);
                }
            });
        } else {
             chatBox.innerHTML = '<div class="no-chat-selected"><p>No messages yet. Start the conversation!</p></div>';
        }
    });

    // --- UI Functions & Event Listeners ---

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (messageInput.value && selectedUser) {
            const message = {
                text: messageInput.value,
                sender: currentUserId,
                receiver: selectedUser.id,
                timestamp: new Date()
            };
            socket.emit('chat message', message);
            displayMessage(message);
            messageInput.value = '';
        }
    });

    function selectUserForChat(user) {
        if (selectedUser) {
            const oldUserEl = document.querySelector(`#friends-list li[data-friend-id="${selectedUser.id}"]`);
            if(oldUserEl) oldUserEl.classList.remove('active');
        }
        selectedUser = user;
        const newUserEl = document.querySelector(`#friends-list li[data-friend-id="${user.id}"]`);
        if (newUserEl) newUserEl.classList.add('active');

        chatWithUsername.innerText = `Chat with ${user.username}`;
        chatBox.innerHTML = '<div class="no-chat-selected"><p>Loading history...</p></div>';
        messageInput.disabled = false;
        sendButton.disabled = false;
        socket.emit('load history', { sender: currentUserId, receiver: user.id });
    }

    function isMessageForCurrentChat(msg) {
        if (!selectedUser) return false;
        return (msg.sender === currentUserId && msg.receiver === selectedUser.id) || (msg.receiver === currentUserId && msg.sender === selectedUser.id);
    }

    function displayMessage(msg) {
        const initialMessage = chatBox.querySelector('.no-chat-selected');
        if (initialMessage) initialMessage.remove();

        const messageElement = document.createElement('div');
        messageElement.className = msg.sender === currentUserId ? 'message sent' : 'message received';

        const bubble = document.createElement('div');
        bubble.classList.add('bubble');
        bubble.textContent = msg.text;

        const timestamp = document.createElement('div');
        timestamp.classList.add('timestamp');
        timestamp.textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        messageElement.appendChild(bubble);
        messageElement.appendChild(timestamp);
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // --- Friend & Request Functions ---

    function sendFriendRequest(recipientId) {
        socket.emit('friend request', { senderId: currentUserId, recipientId: recipientId });
        // Optional: Add visual feedback that the request was sent
        const onlineUserEl = document.querySelector(`#online-users-list li[data-user-id="${recipientId}"] button`);
        if(onlineUserEl) {
            onlineUserEl.innerText = 'Sent';
            onlineUserEl.disabled = true;
        }
    }

    function acceptFriendRequest(requesterId) {
        socket.emit('accept friend request', { userId: currentUserId, requesterId: requesterId });
    }

    function declineFriendRequest(requesterId) {
        socket.emit('decline friend request', { userId: currentUserId, requesterId: requesterId });
        const requestEl = document.getElementById(`request-${requesterId}`);
        if (requestEl) requestEl.remove();
    }

    function addFriendToList(friend) {
        if (document.querySelector(`#friends-list li[data-friend-id="${friend.id}"]`)) return;
        const li = document.createElement('li');
        li.dataset.friendId = friend.id;
        li.innerHTML = `<span class="username">${friend.username}</span>`;
        li.onclick = () => selectUserForChat(friend);
        friendsList.appendChild(li);
    }

    function addRequestToList(request) {
        if (document.getElementById(`request-${request.senderId}`)) return;
        const li = document.createElement('li');
        li.id = `request-${request.senderId}`;
        li.innerHTML = `<span class="username">${request.senderUsername}</span>`;
        
        const acceptBtn = document.createElement('button');
        acceptBtn.innerText = 'Accept';
        acceptBtn.className = 'action-btn';
        acceptBtn.onclick = () => acceptFriendRequest(request.senderId);
        
        const declineBtn = document.createElement('button');
        declineBtn.innerText = 'Decline';
        declineBtn.className = 'action-btn decline';
        declineBtn.onclick = () => declineFriendRequest(request.senderId);
        
        li.appendChild(acceptBtn);
        li.appendChild(declineBtn);
        friendRequestsList.appendChild(li);
    }
});