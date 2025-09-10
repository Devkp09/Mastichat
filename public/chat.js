const socket = io();

const chatContainer = document.querySelector('.chat-container');
const userPhoneNumber = chatContainer.dataset.userPhoneNumber;
const friendsList = document.getElementById('friends-list');
const allUsersList = document.getElementById('all-users-list');
const requestsList = document.getElementById('requests-list');

const chatBox = document.getElementById('chat-box');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message');

const urlParams = new URLSearchParams(window.location.search);
const receiver = urlParams.get('user');

document.getElementById('chat-with').textContent = receiver;

socket.emit('new user', userPhoneNumber);

let friends = [];

socket.on('friends', (friendsList) => {
    friends = friendsList;
});

socket.on('all users', (users) => {
    allUsersList.innerHTML = '';
    users.forEach(user => {
        if (user !== userPhoneNumber) {
            const item = document.createElement('li');
            item.textContent = user;

            if (!friends.includes(user)) {
                const friendButton = document.createElement('button');
                friendButton.textContent = 'Add Friend';
                friendButton.onclick = () => {
                    socket.emit('friend request', { sender: userPhoneNumber, receiver: user });
                    friendButton.disabled = true;
                    friendButton.textContent = 'Request Sent';
                };
                item.appendChild(friendButton);
            }

            allUsersList.appendChild(item);
        }
    });
});

socket.on('online friends', (onlineFriends) => {
    friendsList.innerHTML = '';
    for (const [friend, id] of Object.entries(onlineFriends)) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = `/chat?user=${friend}`;
        link.textContent = friend;
        item.appendChild(link);
        friendsList.appendChild(item);
    }
});

socket.on('new friend request', (data) => {
    const item = document.createElement('li');
    item.textContent = data.sender;

    const acceptButton = document.createElement('button');
    acceptButton.textContent = 'Accept';
    acceptButton.onclick = () => {
        socket.emit('accept friend request', { sender: data.sender, receiver: userPhoneNumber });
        item.remove();
    };

    const declineButton = document.createElement('button');
    declineButton.textContent = 'Decline';
    declineButton.onclick = () => {
        socket.emit('decline friend request', { sender: data.sender, receiver: userPhoneNumber });
        item.remove();
    };

    item.appendChild(acceptButton);
    item.appendChild(declineButton);
    requestsList.appendChild(item);
});

socket.on('friend request accepted', (data) => {
    alert(`You are now friends with ${data.sender || data.receiver}`);
});

socket.on('friend request declined', (data) => {
    alert(`${data.receiver} declined your friend request.`);
});

if (receiver) {
    socket.emit('load history', { sender: userPhoneNumber, receiver });
}

socket.on('history', (history) => {
    history.forEach(msg => {
        displayMessage(msg);
    });
});

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (messageInput.value && receiver) {
        const msg = {
            text: messageInput.value,
            sender: userPhoneNumber,
            receiver: receiver
        };
        socket.emit('chat message', msg);
        messageInput.value = '';
    }
});

socket.on('chat message', (msg) => {
    if (msg.sender === receiver || msg.receiver === receiver) {
        displayMessage(msg);
    }
});

function displayMessage(msg) {
    const item = document.createElement('div');
    item.classList.add('chat-message');
    if (msg.sender === userPhoneNumber) {
        item.classList.add('sent');
    } else {
        item.classList.add('received');
    }

    const sender = document.createElement('div');
    sender.classList.add('sender');
    sender.textContent = msg.sender;

    const text = document.createElement('div');
    text.textContent = msg.text;

    const time = document.createElement('div');
    time.classList.add('time');
    time.textContent = new Date(msg.timestamp).toLocaleTimeString();

    item.appendChild(sender);
    item.appendChild(text);
    item.appendChild(time);
    chatBox.appendChild(item);
    chatBox.scrollTop = chatBox.scrollHeight;
}
