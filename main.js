
const stat = {
	login: false,
	connect: false,

	mainMsgInp_125402: false,

	scroll: false,

	mainMsgInp: {
		text: '',
		pos: 0,
		stack: [ { text: '', pos: 0 } ],
		stackIdx: 0,
	},
};

const config = {
	reconnect: true,
	mainMsgInpMaxLength: 3972,
};

const dom = {
	mainSendBtn: document.querySelector('#mainSendBtn'),
	mainToolBtn: document.querySelector('#mainToolBtn'),
	mainToolBox: document.querySelector('#mainToolBox'),
	mainMsgInp: document.querySelector('#mainMsgInp'),
	msgList: document.querySelector('#msgList'),

	loginBody: document.querySelector('#loginBody'),
};

let socket = null;

const _runWebSocket = async () => {

	if(!config.reconnect){
		return;
	}

	socket = new WebSocket('wss://cat.ipacel.cc/ws/');

	socket.addEventListener('open', () => {
		// console.log('[ws] OPEN');

		stat.connect = true;
	
		setInterval(() => {
			socket.send(JSON.stringify({ type: 'keepalive' }));
		}, 15 * 1000);
	
		socket.send(JSON.stringify({ type: 'login', token: lib.token() }));
	});
	
	socket.addEventListener('close', () => {
		// console.warn('[ws] CLOSE');
		// location.reload();
		socket = null;
		stat.connect = false;
		stat.login = false;
		dom.mainSendBtn.classList.add('--ban');
		_runWebSocket();
	});
	
	socket.addEventListener('message', async (event) => {
		const msg = JSON.parse(event.data);
		// console.log(`[ws] MSG: ${msg.type}`, msg);
		
		if(fn[msg.type]){
			await fn[msg.type](msg);
		}
	
	});
};
_runWebSocket();

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
			return `<pre><code class="hljs" data-lang="${lib.htmlEscape(lang)}">${hljs.highlightAuto(text, lang ? [ lang ] : undefined).value}</code></pre>`;
		},
		codespan: (token) => {
			let { lang, raw, text } = token;
			let _text = raw.replace(/^`|`$/g, '');	// 绕过 html 转义
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
				htmlList.push(`<img src="${lib.htmlEscape(li.data.file)}" loading="lazy" />`);
				break;

			case 'mface':
				htmlList.push(`<img class="mface" src="${lib.htmlEscape(li.data.file)}" />`);
				break;

			case 'at':
				htmlList.push(`<div class="at" title="艾特"></div>`);
				break;

			case 'reply':
				htmlList.push(`<div class="reply" title="引用"></div>`);
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

	getCaretPos: (el) => {
		const range = window.getSelection().getRangeAt(0);
		const rangeClone = range.cloneRange();
		rangeClone.selectNodeContents(el);
		rangeClone.setEnd(range.endContainer, range.endOffset);
		return rangeClone.toString().length;
	},

	setCaretPos: (el, pos) => {
		const range = document.createRange();
		if(!el.firstChild) return;
		range.setStart(el.firstChild, pos);
		range.collapse(true);
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	},

	htmlEscape: (text) => `${text || ''}`
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/ /g, '&nbsp;')
		.replace(/\'/g, '&#39;')
		.replace(/\"/g, '&quot;'),

};

dom.mainMsgInp.addEventListener('keydown', (event) => {
	
	// 自己实现了撤销和重做 :(
	if(event.ctrlKey){
		if(event.key === 'z'){
			event.preventDefault();
			stat.mainMsgInp.stackIdx = stat.mainMsgInp.stackIdx > 0 ? stat.mainMsgInp.stackIdx - 1 : 0;
			const { text, pos } = stat.mainMsgInp.stack[stat.mainMsgInp.stackIdx];
			dom.mainMsgInp.innerText = text;
			lib.setCaretPos(dom.mainMsgInp, pos);
		}else if(event.key === 'y'){
			event.preventDefault();
			stat.mainMsgInp.stackIdx = stat.mainMsgInp.stackIdx < stat.mainMsgInp.stack.length - 1 ? stat.mainMsgInp.stackIdx + 1 : stat.mainMsgInp.stack.length - 1;
			console.log(stat.mainMsgInp.stackIdx);
			const { text, pos } = stat.mainMsgInp.stack[stat.mainMsgInp.stackIdx];
			dom.mainMsgInp.innerText = text;
			lib.setCaretPos(dom.mainMsgInp, pos);
		}
		return;
	}
	
	if(event.key === 'Enter'){
		if(!event.shiftKey){
			// 如果文本中已经存在至少一个换行, 则不发送消息
			if(!/\n/.test(dom.mainMsgInp.innerText)){
				event.preventDefault();
				dom.mainSendBtn.click();
			}
		}
	}
});

dom.mainMsgInp.addEventListener('paste', (event) => {

	let text = event.clipboardData.getData('text');
	const maxLength = dom.mainMsgInp.innerText.length + text.length;

	if(maxLength > config.mainMsgInpMaxLength){
		text = text.slice(0, config.mainMsgInpMaxLength - maxLength);
		
		// 插入到当前光标处
		const pos = lib.getCaretPos(dom.mainMsgInp);
		const newText = dom.mainMsgInp.innerText.slice(0, pos) + text + dom.mainMsgInp.innerText.slice(pos);
		
		dom.mainMsgInp.innerText = newText;
		// 将光标移动到插入之后的位置
		lib.setCaretPos(dom.mainMsgInp, pos + text.length);

		// 常规保存
		stat.mainMsgInp.text = dom.mainMsgInp.innerText;
		stat.mainMsgInp.pos = pos + text.length;
	}
});

dom.mainMsgInp.addEventListener('input', (event) => {

	if(dom.mainMsgInp.innerText.length > config.mainMsgInpMaxLength){
		dom.mainMsgInp.innerText = stat.mainMsgInp.text;
		lib.setCaretPos(dom.mainMsgInp, stat.mainMsgInp.pos);
	}else{
		stat.mainMsgInp.text = dom.mainMsgInp.innerText;
		stat.mainMsgInp.pos = lib.getCaretPos(dom.mainMsgInp);

		// 支持撤销功能
		if(stat.mainMsgInp.text !== stat.mainMsgInp.stack[stat.mainMsgInp.stackIdx]?.text){
			if(stat.mainMsgInp.stackIdx < stat.mainMsgInp.stack.length - 1){
				stat.mainMsgInp.stack = stat.mainMsgInp.stack.slice(0, stat.mainMsgInp.stackIdx + 1);
			}
	
			stat.mainMsgInp.stack.push({
				text: stat.mainMsgInp.text,
				pos: stat.mainMsgInp.pos,
			});
			stat.mainMsgInp.stackIdx = stat.mainMsgInp.stack.length - 1;
	
			if(stat.mainMsgInp.stack.length > 256){
				stat.mainMsgInp.stack.shift();
			}
		}
	}
});


dom.mainSendBtn.addEventListener('click', async () => {

	if(!(stat.connect && stat.login)){
		return;
	}

	const uiUserMsgPlugins = [];

	const inpText = dom.mainMsgInp.innerText.trim().replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF]+/g, '');
	if(inpText){
		dom.mainMsgInp.innerText = '';
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
});

dom.mainToolBtn.addEventListener('click', async () => {

	if(dom.mainToolBox.classList.contains('--quit')){
		dom.mainToolBox.classList.remove('--quit');
	}else{
		dom.mainToolBox.classList.add('--quit');
	}

});

window.addEventListener('scroll', () => {
	if(stat.scroll) return;
	stat.scroll = true;
	setTimeout(() => {
		stat.scroll = false;

		// 彩蛋
		if(stat.mainMsgInp_125402 === false && dom.mainMsgInp.offsetHeight > 125402){
			stat.mainMsgInp_125402 = true;
			lib.dog('egg125402', true);
		}

	}, 200);
});


// 启动
setTimeout(async () => {
	document.querySelector('.main').classList.remove('--quit');

	await lib.sleep(100);

	await lib.loadMsg(64);
}, 100);

dom.mainMsgInp.focus();


Promise.resolve().then(console.log(`%c${String.raw`
 ______                                                            __     
/\__  _\          %cIpacamod powered by Dev and Our-player%c          /\ \    
\/_/\ \/    _____     ____     ____   ____    ____ ___     ____   \_\ \   
   \ \ \   /\  __ \  / __ \   / ___\ / __ \  /  __  __ \  / __ \  / __ \  
    \_\ \__\ \ \/\ \/\ \/\ \_/\ \__//\ \/\ \_/\ \/\ \/\ \/\ \/\ \/\ \/\ \ 
    /\_____\\ \  __/\ \__/ \_\ \____\ \__/ \_\ \_\ \_\ \_\ \____/\ \_____\
    \/_____/ \ \ \/  \/__/\/_/\/____/\/__/\/_/\/_/\/_/\/_/\/___/  \/____ /
              \ \_\                                                       
               \/_/       %c[MY THOUGHT? SUFFER WHAT THEREFORE]             
`}`, 'color: #008FFF', 'color: #17D9FF', 'color: #008FFF', 'color: #80808005'));

Promise.resolve().then(console.log(`
%c== INFO ==
 | ApliNi: aplini@ipacel.cc
 | Code: https://github.com/ApliNi/cat.ipacel.cc
`, 'color: #FF8C00'));
