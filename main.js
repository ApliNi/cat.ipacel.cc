
const stat = {
	login: false,
	connect: false,

	mainMsgInp_125402: false,
};

const config = {
	reconnect: true,
};

let socket = null;

const fn = {

	'login': async (msg) => {
		if(msg.finish === 200){
			if(msg.token){
				localStorage.setItem('token', msg.token);
			}

			dom.mainSendBtn.classList.remove('--ban');
			lib.dog('login', false);

			stat.login = true;
		}
		
		else if(msg.finish === 300){

			dom.loginBody.innerHTML = `
				<p>1. 加入任意一个存在 CiAt 的<a href="https://qm.qq.com/q/E6eG9gppao" target="_blank"> QQ 群</a></p>
				<p>2. 点击复制, 将指令发送到群聊或私聊</p>
				<p class="code" onclick="lib.copy(this.textContent)">!WEB ${msg.key}</p>
			`;

			lib.dog('login', true);
		}
	},

	'userMsg': async (msg) => {

		dom.mainSendBtn.classList.add('--light');
		setTimeout(() => {
			dom.mainSendBtn.classList.remove('--light');
		}, 1000);

		const dialog = dom.msgList.querySelector(`.li.time_${msg.time}`);
		if(!dialog){
			return;
		}
		const loading = dom.msgList.querySelector(`.li.time_${msg.time} .loading`);
		if(loading){
			delMsg(dialog, loading);
		}
		
		addMsg(dialog, 'ai', renderPluginsMsg(msg.plugins));

		lib.saveMsg('ai', msg.plugins);
	},

	'kick': async (msg) => {
		config.reconnect = false;
		socket.close();

		dom.loginBody.innerHTML = `
			<p>${lib.htmlEscape(msg.msg)}</p>
		`;

		lib.dog('login', true);
	},
};

marked.use({
	breaks: true,
	renderer: {
		link: (token) => {
			let { href, raw, text, title } = token;
			return `<a href="${href}" target="_blank">${text}</a>`;
		},
		image: (token) => {
			let { href, raw, text, title } = token;
			return `<img src="${href}" alt="${text}" title="${title}" loading="lazy" />`;
		},
		code: (token) => {
			let { lang, raw, text } = token;
			return `<pre><code class="hljs" data-lang="${lib.htmlEscape(lang)}">${hljs.highlightAuto(text, [ lang ]).value}</code></pre>`;
		},
		codespan: (token) => {
			let { lang, raw, text } = token;
			// console.log(token);
			let _text = raw.replace(/^`|`$/g, '');
			return `<code class="hljs">${hljs.highlightAuto(_text).value}</code>`;
		},
		html: (token) => {
			// 这可能不够安全, 可选用 purify.min.js 再次处理
			try{
				// console.log(token);
				return lib.htmlEscape(token.text);
			}catch(err){
				console.error(err);
			}
			return '';
		},
	},
});

const markdownRender = (text) => {
	return marked.parse(text.replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF]+/g, ''));
};

const renderPluginsMsg = (plugins) => {
	const htmlList = [];
	for(const li of plugins){
		switch(li.type){

			case 'text':
				htmlList.push(`<span>${markdownRender(li.data.text)}</span>`);
				break;
			
			case 'image':
				htmlList.push(`<img src="${lib.htmlEscape(li.data.file)}" />`);
				break;

			case 'mface':
				htmlList.push(`<img class="mface" src="${lib.htmlEscape(li.data.file)}" />`);
				break;
		
			default:
				htmlList.push(`<span>${JSON.stringify(li)}</span>`);
				break;
		}
	}
	return htmlList.join('');
};

const createDialog = (time, top = true) => {
	const dialog = document.createElement('div');
	dialog.setAttribute('class', `li time_${time}`);
	// dom.msgList.appendChild(dialog);
	if(top){
		if(dom.msgList.firstChild){
			dom.msgList.insertBefore(dialog, dom.msgList.firstChild);
		}else{
			dom.msgList.appendChild(dialog);
		}
	}else{
		dom.msgList.appendChild(dialog);
	}
	

	for(let i = 0; i < dom.msgList.childNodes.length - 100; i++){
		dom.msgList.removeChild(dom.msgList.firstChild);
	}

	dom.currentDialog = dialog;

	return dialog;
};

const delMsg = async (dialog, el, reHeight = false) => {

	if(reHeight){
		const height = dialog.offsetHeight - el.offsetHeight - cssCfg.liMsgMarginBottom;
		dialog.setAttribute('style', `height: ${height}px;`);
	}
	el.setAttribute('style', `margin-top: -${el.offsetHeight + cssCfg.liMsgMarginBottom}px;`);
	el.classList.add('--quit');
	el.classList.add('--neglect');

	setTimeout(() => {
		el.remove();
		// 如果对话框空了, 就删除这个对话框
		if(dialog.childNodes.length === 0){
			dialog.remove();
		}
	}, 500);
};

const addMsg = async (dialog, type = 'user', html = '', top = false) => {

	requestAnimationFrame(() => {
		dialog.setAttribute('data-update-time', Date.now());
		const msg = document.createElement('div');
		msg.innerHTML = html;
		msg.setAttribute('class', `msg ${type} --quit`);
		// 如果只有一个 img 元素
		if(msg.children.length === 1 && msg.children[0].tagName === 'IMG'){
			msg.classList.add('single_img');
		}
		if(top){
			if(dialog.firstChild){
				dialog.insertBefore(msg, dialog.firstChild);
			}else{
				dialog.appendChild(msg);
			}
		}else{
			dialog.appendChild(msg);
		}

		requestAnimationFrame(() => {
			msg.classList.remove('--quit');
			const height = Array.from(dialog.childNodes).reduce((acc, child) => child.classList.contains('--neglect') ? acc : acc + child.offsetHeight + cssCfg.liMsgMarginBottom, 0);
			dialog.setAttribute('style', `height: ${height}px;`);

			setTimeout(() => {
				if(dialog.getAttribute('data-update-time') < Date.now() - 350){
					dialog.setAttribute('style', `height: fit-content;`);
				}
			}, 350);
		});
	});
};

const cssCfg = {
	liMsgMarginBottom: 25,
};

const lib = {

	_token: null,
	token: (inp = null) => {
		lib._token = inp || localStorage.getItem('token');
		if(inp){
			localStorage.setItem('token', inp);
		}
		return lib._token;
	},

	sleep: (time) => new Promise((resolve) => setTimeout(resolve, time)),

	saveMsg: async (role, plugins) => {
		const msgList = JSON.parse(localStorage.getItem('saveMsg')) || [];
		msgList.push({ role, plugins });

		for(let i = 0; i < msgList.length - 100; i++){
			msgList.shift();
		}

		localStorage.setItem('saveMsg', JSON.stringify(msgList));
	},

	loadMsg: async (delay = 0) => {
		const msgList = JSON.parse(localStorage.getItem('saveMsg')) || [];

		let dialog = createDialog(0);

		for(let i = msgList.length - 1; i >= 0; i--){
			const msg = msgList[i];
			if(msg.role === 'user'){
				// 创建新对话框
				addMsg(dialog, 'user', renderPluginsMsg(msg.plugins), true);
				dialog = createDialog(0, false);
			}
			if(msg.role === 'ai'){
				addMsg(dialog, 'ai', renderPluginsMsg(msg.plugins), true);
			}

			await lib.sleep(delay);
		}
	},

	clearMsg: async (delLocalStorage = false) => {
		if(delLocalStorage){
			localStorage.removeItem('saveMsg');
		}

		dom.msgList.classList.add('--clear');

		setTimeout(() => {
			dom.msgList.innerHTML = '';
			dom.msgList.classList.remove('--clear');
		}, 1300);

		window.scrollTo({ top: 0, behavior: 'smooth' });
	},

	dog: async (name, stat) => {
		const dog = document.getElementById('dog');
		const body = dog.querySelector(`#dog > .${name}`);

		if(stat){
			dog.showModal();
			body.classList.add('--open');
		}else{
			body.classList.remove('--open');
			setTimeout(() => {
				dog.close();
			}, 210);
		}
	},

	copy: (text) => {
		navigator.clipboard.writeText(text);
	},

	htmlEscape: (text) => `${text || ''}`
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/ /g, '&nbsp;')
		.replace(/\'/g, '&#39;')
		.replace(/\"/g, '&quot;'),

};

const dom = {
	mainSendBtn: document.querySelector('#mainSendBtn'),
	mainMsgInp: document.querySelector('#mainMsgInp'),
	msgList: document.querySelector('#msgList'),

	loginBody: document.querySelector('#loginBody'),
};

let uiUserMsgPlugins = [];

dom.mainMsgInp.addEventListener('keydown', (event) => {
	if(event.keyCode === 13){
		if(!event.shiftKey){
			event.preventDefault();
			dom.mainSendBtn.click();
		}
	}
});

dom.mainSendBtn.addEventListener('click', async () => {

	if(!(stat.connect && stat.login)){
		return;
	}

	const inpText = dom.mainMsgInp.value.trim().replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF]+/g, '');
	if(inpText){
		dom.mainMsgInp.value = '';
		uiUserMsgPlugins.push({ type: 'text', data: { text: inpText }});
	}

	if(uiUserMsgPlugins.length === 0){
		return;
	}
	
	const time = Date.now();
	
	const dialog = createDialog(time);
	addMsg(dialog, 'user', renderPluginsMsg(uiUserMsgPlugins));
	addMsg(dialog, 'loading');

	lib.saveMsg('user', uiUserMsgPlugins);
	
	socket.send(JSON.stringify({ type:'userMsg', plugins: uiUserMsgPlugins, time, token: lib.token() }));
	uiUserMsgPlugins = [];
});

window.addEventListener('scroll', async () => {
	
	// 彩蛋
	if(stat.mainMsgInp_125402 === false && dom.mainMsgInp.offsetHeight > 125402){
		stat.mainMsgInp_125402 = true;
		lib.dog('egg125402', true);
	}
});

const _runWebSocket = async () => {

	if(!config.reconnect){
		return;
	}

	socket = new WebSocket('wss://cat.ipacel.cc/ws/');

	socket.addEventListener('open', () => {
		console.log('[ws] OPEN');

		stat.connect = true;
	
		setInterval(() => {
			socket.send(JSON.stringify({ type: 'keepalive' }));
		}, 15 * 1000);
	
		socket.send(JSON.stringify({ type: 'login', token: lib.token() }));
	});
	
	socket.addEventListener('close', () => {
		console.warn('[ws] CLOSE');
		// alert('连接已断开...');
		// location.reload();
		socket = null;
		stat.connect = false;
		stat.login = false;
		dom.mainSendBtn.classList.add('--ban');
		_runWebSocket();
	});
	
	socket.addEventListener('message', async (event) => {
		const msg = JSON.parse(event.data);
		console.log(`[ws] MSG: ${msg.type}`, msg);
		
		if(fn[msg.type]){
			await fn[msg.type](msg);
		}
	
	});
};
_runWebSocket();


// 启动
setTimeout(async () => {
	document.querySelector('.main').classList.remove('--quit');

	await lib.sleep(100);

	await lib.loadMsg(40);
}, 100);

