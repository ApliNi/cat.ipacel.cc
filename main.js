import markedExtendedLatex from "./l2/marked-extended-latex.js";

export const stat = {
	login: false,
	connect: false,

	scroll: false,

	mainMsgInp: {
		text: '',
		pos: 0,
		stack: [ { text: '', pos: 0 } ],
		stackIdx: 0,
	},

	mainMsgInpAutoSave: {
		text: '',
		pos: 0,
		stackIdx: 0,
	},

	clearMsg: false,

	copyEl: null,
};

const config = {
	reconnect: true,
	maxMsgInpLength: 3072,
	maxImgCount: 3,
	maxImgBase64Length: 4 * 1024 * 1024,
	saveMsgLength: 128,
	// .msg 外边距
	liMsgHeightOffset: 25,
	// .li 内边距
	liHeightOffset: 32 + 32,
};

const dom = {
	mainSendBtn: document.querySelector('#mainSendBtn'),
	mainBtnBox: document.querySelector('#mainBtnBox'),
	mainToolBtn: document.querySelector('#mainToolBtn'),
	mainMsgInp: document.querySelector('#mainMsgInp'),
	mainFileInp: document.querySelector('#mainFileInp'),
	inpFileBox: document.querySelector('#inpFileBox'),
	msgList: document.querySelector('#msgList'),

	loginBody: document.querySelector('#loginBody'),

	toTopBtn: document.querySelector('#toTopBtn'),
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

		await msgListener.on(msg);
		
		if(fn[msg.type]){
			await fn[msg.type](msg);
		}
	
	});
};
	
setInterval(() => {
	if(stat.connect && socket){
		socket.send(JSON.stringify({ type: 'keepalive' }));
	}
}, 15 * 1000);

const msgListener = {
	_id: 0,
	_list: {},
	add: (fn, ready = () => {}) => new Promise((resolve, reject) => {
		const cb = (data) => {
			resolve(data);
		};
		msgListener._list[++msgListener._id] = {
			fn, cb
		};
		ready();
	}),
	on: async (inpData) => {
		for(const id in msgListener._list){
			const cbData = await msgListener._list[id].fn(inpData);
			if(cbData !== false){
				await msgListener._list[id].cb(cbData);
			}
		}
	},
};

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
				<h3>帮助我们战胜机器人 👾</h3>
				<p class="paddingLeft15">1. 加入任意一个存在 CiAt 的<a href="https://qm.qq.com/q/E6eG9gppao" target="_blank"> QQ 群</a></p>
				<p class="paddingLeft15">2. 点击复制, 将指令发送到群聊或私聊</p>
				<p class="code" onclick="lib.copy(this.textContent)">!WEB ${msg.key}</p>
			`;

			lib.dog('login', true);
		}
	},

	'userMsg': async (msg) => {

		lib.btnFlash(dom.mainSendBtn);

		const dialog = dom.msgList.querySelector(`.li.time_${msg.time}`);
		if(!dialog){
			return;
		}
		const loading = dom.msgList.querySelector(`.li.time_${msg.time} .loading`);
		if(loading){
			delMsg(dialog, loading);
		}
		
		addMsg(dialog, 'ai', renderPluginsMsg(msg.plugins, dialog));

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

marked.use(markedExtendedLatex({
	render: (formula, displayMode) => {

		let html = katex.renderToString(formula, {
			displayMode: displayMode,
			output: 'html',
		});

		const mark = /^<span class="katex-display">/.test(html) ? '$$' : '$';

		html = html.replace(/<span class="katex">/, `<span class="katex ${mark === '$$' ? '--block' : ''}" data-copy="${lib.htmlAttrEscape(`${mark}${formula}${mark}`)}">`);
		return html;
	},
}));

marked.use({
	breaks: true,
	renderer: {
		link: (token) => {
			let { href, raw, text, title } = token;
			const safetyHref = lib.htmlAttrEscape(href);
			return `<a href="${safetyHref}" title="${lib.htmlAttrEscape(title || '')}" target="_blank" title="${safetyHref}">${lib.htmlEscape(text)}</a>`;
		},
		image: (token) => {
			let { href, raw, text, title } = token;
			return `<img src="${lib.htmlAttrEscape(href)}" alt="${lib.htmlAttrEscape(text || '')}" title="${lib.htmlAttrEscape(title)}" loading="lazy" />`;
		},
		code: (token) => {
			let { lang, raw, text } = token;
			const safetyLang = lib.htmlAttrEscape(lang || '');
			return `<pre><button class="btn" onclick="lib.copy(this.nextElementSibling.innerText); lib.btnFlash(this, 1500);" title="${`${safetyLang} 点击复制`.trim()}">#</button><code class="hljs --block" data-lang="${safetyLang}">${hljs.highlightAuto(text, lang ? [ lang ] : undefined).value}</code></pre>`;
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

const renderPluginsMsg = (plugins, dialog) => {
	const htmlList = [];
	for(const li of plugins){
		switch(li.type){

			case 'text':
				htmlList.push(`<span>${markdownRender(li.data.text)}</span>`);
				break;
			
			case 'image':
				htmlList.push(`<img alt="" src="${lib.htmlAttrEscape(li.data.file)}" loading="lazy" onclick="lib.openImg(this)" />`);
				break;

			case 'mface':
				htmlList.push(`<img class="mface" alt="表情图片" src="${lib.htmlAttrEscape(li.data.file)}" loading="lazy" />`);
				break;

			case 'at':
				htmlList.push(`<div class="at __markIgnore" title="艾特"></div>`);
				break;

			case 'reply':
				htmlList.push(`<div class="reply __markIgnore" title="引用"></div>`);
				break;

			case 'dice':
				htmlList.push(`<span class="dice dice">🎲: ${li.idx}</span>`);
				break;

			case 'rps':
				const rps = [ '✌️', '✊', '🖐️' ];
				htmlList.push(`<span class="dice rps">${rps[li.idx]}</span>`);
				break;

			case 'loading':
				setTimeout(() => {
					addMsg(dialog, 'loading');
				}, 50);
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
	

	for(let i = 0; i < dom.msgList.childNodes.length - config.saveMsgLength; i++){
		dom.msgList.removeChild(dom.msgList.firstChild);
	}

	dom.currentDialog = dialog;

	return dialog;
};

const delMsg = async (dialog, el, reHeight = true) => {

	if(reHeight){
		const height = dialog.offsetHeight - el.offsetHeight - config.liMsgHeightOffset;
		dialog.setAttribute('style', `height: ${height}px;`);
	}
	el.setAttribute('style', `margin-top: -${el.offsetHeight + config.liMsgHeightOffset}px;`);
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

const addMsg = async (dialog, type = 'user', html = '', toTop = false) => {

	try{
		requestAnimationFrame(() => {
			dialog.setAttribute('data-update-time', Date.now());
			const msg = document.createElement('div');
			msg.innerHTML = html;
			msg.setAttribute('class', `msg ${type} --quit`);
			// 如果只有一个 img 元素
			const comp = Array.from(msg.children).filter((child) => !child.classList.contains('__markIgnore'));
			if(comp.length === 1 && comp[0].tagName === 'IMG'){
				msg.classList.add('single_img');
			}
			if(toTop){
				if(dialog.firstChild){
					dialog.insertBefore(msg, dialog.firstChild);
				}else{
					dialog.appendChild(msg);
				}
			}else{
				dialog.appendChild(msg);
			}

			// 超出视口范围就不需要渲染过度动画了
			if(!lib.inViewport(dialog, 0.3)){
				msg.classList.remove('--quit');
				dialog.setAttribute('style', `height: fit-content;`);
				return;
			}
	
			requestAnimationFrame(() => {

				const height = Array.from(dialog.childNodes).reduce((acc, child) =>
					child.classList.contains('--neglect') ? acc : acc + child.offsetHeight + config.liMsgHeightOffset,
					0
				) + config.liHeightOffset;
				
				dialog.setAttribute('style', `height: ${height}px;`);
				msg.classList.remove('--quit');
	
				setTimeout(() => {
					if(dialog.getAttribute('data-update-time') < Date.now() - 350){
						dialog.setAttribute('style', `height: fit-content;`);
					}
				}, 350);
			});
		});
	}catch(err){
		console.warn('[addMsg]', err);
	}
};

export const lib = {

	loadMsg: async (delay = 0) => {
		const msgList = JSON.parse(localStorage.getItem('saveMsg')) || [

			{"role":"user","plugins":[{"type":"text","data":{"text":"`/^( *)(bull) [\\s\\S]+?(?:hr|def|\\n{2,}(?! )(?!\\1bull )\\n*|\\s*$)/`\n帮我分析这个正则表达式"}}]},

			{"role":"ai","plugins":[{"type":"text","data":{"text":"这个正则表达式的作用是匹配一个特定格式的文本块，具体分析如下：\n\n1. `^`：匹配输入的开始位置。\n2. `( *)`：匹配零个或多个空格字符，并将其捕获为组 1。\n3. `(bull)`：匹配字符串 \"bull\"，并将其捕获为组 2。\n4. `[\\\\s\\\\S]+?`：匹配一个或多个任意字符（包括空白和非空白），使用非贪婪模式。\n5. `(?: ... )`：这是一个非捕获组，用于组合多个条件：\n   - `hr`：匹配字符串 \"hr\"。\n   - `def`：匹配字符串 \"def\"。\n   - `\\\\n {2,}(?! )(?!\\\\1bull )\\\\n*`：匹配两个或多个换行符，后面不能跟空格且不能跟前面捕获的空格和 \"bull\"。\n   - `|`：表示或的关系。\n   - `\\\\s*$`：匹配零个或多个空白字符，直到输入的结束位置。\n\n综上所述，这个正则表达式主要用于匹配以 \"bull\" 开头的文本块，后面可以跟随任意内容，最后以特定的方式结束。如果你有更多问题或者想深入讨论，随时告诉我哦 (｡・̀ᴗ-)✧"}}]},

			{"role":"user","plugins":[{"type":"text","data":{"text":"编写一个四行四列的表格"}}]},

			{"role":"ai","plugins":[{"type":"text","data":{"text":"当然可以! 这是一个四行四列的表格：\n\n| 列1 | 列2 | 列3 | 列4 |\n|-----|-----|-----|-----|\n| 行1 | 行1 | 行1 | 行1 |\n| 行2 | 行2 | 行2 | 行2 |\n| 行3 | 行3 | 行3 | 行3 |\n| 行4 | 行4 | 行4 | 行4 |\n\n这样可以吗？(｡・̀ᴗ-)✧"}}]},

			{"role":"user","plugins":[{"type":"text","data":{"text":"介绍一下你自己"}}]},

			{"role":"ai","plugins":[{"type":"text","data":{"text":"你好呀，我是来自 IpacEL 的 CiAt 哦 (｡・̀ᴗ-)✧ 我是一名开发者，和大家一起交流和学习。如果你有任何问题或者想聊的内容，随时告诉我哦！"}}]},

			{"role":"user","plugins":[{"type":"text","data":{"text":"定积分的基本定理"}}]},

			{"role":"ai","plugins":[{"type":"text","data":{"text":"定积分的基本定理主要包括两个部分：第一部分是关于不定积分的微分，第二部分是关于定积分的计算。它说明了定积分与不定积分之间的关系，具体来说，如果 $F(x)$ 是 $f(x)$ 的一个不定积分，那么：\n\n$$ \\int_{a}^{b} f(x) \\, dx = F(b) - F(a) $$\n\n这让我们可以通过找到一个原函数来计算定积分哦 (｡・̀ᴗ-)✧"}}]},
		];

		let dialog = createDialog(0);

		for(let i = msgList.length - 1; i >= 0; i--){
			// 加载过程中运行了清除消息
			if(stat.clearMsg){
				stat.clearMsg = false;
				return;
			}
			const msg = msgList[i];
			if(msg.role === 'user'){
				// 创建新对话框
				addMsg(dialog, 'user', renderPluginsMsg(msg.plugins, dialog), true);
				dialog = createDialog(0, false);
			}
			if(msg.role === 'ai'){
				addMsg(dialog, 'ai', renderPluginsMsg(msg.plugins, dialog), true);
			}

			await lib.sleep(delay);
		}
	},

	clearMsg: async (delLocalStorage = false) => {

		stat.clearMsg = true;

		lib.toTop();

		if(delLocalStorage){
			localStorage.removeItem('saveMsg');
		}

		dom.msgList.classList.add('--clear');

		setTimeout(() => {
			dom.msgList.innerHTML = '';
			dom.msgList.classList.remove('--clear');

			stat.clearMsg = false;
		}, 1150);
	},

	saveMsg: async (role, _plugins) => {

		const plugins = [];

		for(const plugin of _plugins){
			if(plugin.type === 'loading'){
				continue;
			}
			plugins.push(plugin);
		}

		const msgList = JSON.parse(localStorage.getItem('saveMsg')) || [];
		msgList.push({ role, plugins });

		for(let i = 0; i < msgList.length - config.saveMsgLength; i++){
			msgList.shift();
		}

		localStorage.setItem('saveMsg', JSON.stringify(msgList));
	},

	syncMainInpStat: (loadMode = false) => {
		if(loadMode){
			try{
				stat.mainMsgInp = JSON.parse(localStorage.getItem('mainMsgInpAutoSave')) || stat.mainMsgInp;
				const { text, pos } = stat.mainMsgInp.stack[stat.mainMsgInp.stackIdx];
				dom.mainMsgInp.textContent = text;
				lib.setCaretPos(dom.mainMsgInp, pos);
			}catch(ignoreErr){}
		}else{
			const { text, pos, stackIdx } = stat.mainMsgInp;
			if(stat.mainMsgInpAutoSave.text !== text || stat.mainMsgInpAutoSave.pos !== pos || stat.mainMsgInpAutoSave.stackIdx !== stackIdx){
				stat.mainMsgInpAutoSave.text = text;
				stat.mainMsgInpAutoSave.pos = pos;
				stat.mainMsgInpAutoSave.stackIdx = stackIdx;
				Promise.resolve().then(() => {
					localStorage.setItem('mainMsgInpAutoSave', JSON.stringify(stat.mainMsgInp));
				});
			}
		}
	},

	clearMainInpStat: () => {
		dom.mainMsgInp.textContent = '';
		stat.mainMsgInp.text = '';
		stat.mainMsgInp.pos = 0;
		stat.mainMsgInp.stack = [
			{ text: '', pos: 0 }
		];
		stat.mainMsgInp.stackIdx = 0;
	},

	token: (inp = null) => {
		if(inp){
			localStorage.setItem('token', inp);
			return inp;
		}else{
			return localStorage.getItem('token');
		}
	},

	sleep: (time) => new Promise((resolve) => setTimeout(resolve, time)),

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

	openImg: (img) => {
		let src = img.src;

		// 检查 Base64 图片
		if(/^data:image\/[^;]{1,10};base64,/i.test(src)){
			const fileType = src.split(';')[0].split('/')[1];
			const base64 = src.replace(/data:([^;]*);base64,/, '');
			const byteCharacters = atob(base64);

			// 创建一个 8 位的数组, 长度等于解码后的字符串长度
			const byteNumbers = new Array(byteCharacters.length);
			for(let i = 0; i < byteCharacters.length; i++){
				byteNumbers[i] = byteCharacters.charCodeAt(i);
			}
			// 将8位的数组转换为Blob对象
			const byteArray = new Uint8Array(byteNumbers);
			const blob = new Blob([byteArray], {type: fileType});
		
			// 获取本地 URL
			src = URL.createObjectURL(blob);
		}

		const width = Math.max(img.naturalWidth, 370);
		const height = Math.max(img.naturalHeight, 310);

		const maxWidth = screen.width * 0.6;
		const maxHeight = screen.height * 0.6;

		const ratio = width / height;
		let setWidth, setHeight;
		if(maxWidth <= maxHeight * ratio){
			setWidth = maxWidth;
			setHeight = maxWidth / ratio;
		}else{
			setHeight = maxHeight;
			setWidth = maxHeight * ratio;
		}
		setWidth = Math.min(setWidth, width);
		setHeight = Math.min(setHeight, height);

		const left = (screen.width - setWidth) / 2;
		const top = (screen.height - setHeight) / 2;

		const params = `fullscreen=no, titlebar=no, status=no, location=no, toolbar=no, menubar=no, width=${setWidth}, height=${setHeight}, left=${left}, top=${top}`;
		window.open(`./img.html?src=${encodeURIComponent(src)}`, `img_${src}`, params);
	},

	copy: (text) => {
		navigator.clipboard.writeText(text);
	},

	btnFlash: (el, time = 1000) => {
		el.classList.add('--light');
		setTimeout(() => {
			el.classList.remove('--light');
		}, time);
	},

	btnUpload: () => {
		dom.mainFileInp.click();
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
		try{
			range.setStart(el.firstChild, pos);
			range.collapse(true);
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(range);
		}catch(err){
			console.error(err);
		}
	},

	select: (el) => {
		const range = document.createRange();
		range.selectNode(el);
		window.getSelection().removeAllRanges();
		window.getSelection().addRange(range);
	},

	inViewport: (el, redundancyRatio = 0.0) => {
		const rect = el.getBoundingClientRect();

		const winHeight = window.innerHeight || document.documentElement.clientHeight;
		const top = rect.top - (rect.bottom - rect.top) + winHeight * redundancyRatio;
		
		return top > 0 && top < winHeight;
	},

	toTop: async () => {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	},

	getTextNodeList: (el) => {
		if(el.nodeType === Node.TEXT_NODE){
			return [el];
		}
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		const textNodeList = [];
		let currentNode;
		while(currentNode = walker.nextNode()){
			textNodeList.push(currentNode);
		}
		return textNodeList;
	},

	htmlEscape: (text) => `${text || ''}`
		.replace(/&/g, '&amp;')
		.replace(/\$/g, '&#36;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		// .replace(/ /g, '&nbsp;') // 影响文本换行
		.replace(/`/g, '&grave;')
		.replace(/'/g, '&apos;')
		.replace(/"/g, '&quot;'),
	
	htmlAttrEscape: (text) => `${text || ''}`
		.replace(/&/g, '&amp;')
		.replace(/\$/g, '&#36;')
		.replace(/"/g, '&quot;'),

};

const onFile = {

	image: async (base64) => {
			
		// 达到图片上传数量限制
		const imgList = Array.from(dom.inpFileBox.querySelectorAll('img.file'));
		if(imgList.length >= config.maxImgCount){
			return;
		}

		const fileType = base64.split(';')[0].split('/')[1];
		if(!/^(png|jpg|jpeg)$/i.test(fileType)){

			try{
				const img = new Image();
				await new Promise((resolve) => {
					img.src = base64;
					img.onload = resolve;
				});
				const canvas = document.createElement('canvas');
				canvas.width = img.width;
				canvas.height = img.height;
				canvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);
				base64 = canvas.toDataURL('image/png');
			}catch(err){
				const dialog = createDialog('ui');
				addMsg(dialog, 'ai', `<p>[/] 图像解析失败啦</p>`, true);
				return;
			}
		}

		if(base64.length > config.maxImgBase64Length){

			let zoom = 1;
			
			while(true){

				try{
					const img = new Image();
					await new Promise((resolve) => {
						img.src = base64;
						img.onload = resolve;
					});
					const canvas = document.createElement('canvas');
					canvas.width = img.width * zoom;
					canvas.height = img.height * zoom;
					canvas.getContext('2d').drawImage(img, 0, 0, img.width * zoom, img.height * zoom);
					base64 = canvas.toDataURL('image/jpeg');
				}catch(err){
					const dialog = createDialog('ui');
					addMsg(dialog, 'ai', `<p>[/] 图像压缩失败啦</p>`, true);
					return;
				}

				console.log('[图像压缩]', zoom, base64.length / 1024 / 1024);

				if(base64.length > config.maxImgBase64Length){
					zoom -= 0.3;
					if(zoom <= 0){
						addMsg(dialog, 'ai', `<p>[/] 图像压缩失败啦</p>`, true);
						return;
					}
				}else{
					break;
				}
			}
		}

		// 内容和已有图片相同
		if(imgList.some((img) => base64 === img.src)){
			const dialog = createDialog('ui');
			addMsg(dialog, 'ai', `<p>[/] 这张图片已经存在了哦</p>`, true);
			return;
		};

		const img = document.createElement('img');
		img.setAttribute('class', 'file');
		img.src = base64;
		img.onclick = () => {
			lib.openImg(img);
		};
		
		const div = document.createElement('div');
		div.setAttribute('class', 'li');
		div.appendChild(img);

		requestAnimationFrame(() => {
			dom.inpFileBox.appendChild(div);
			requestAnimationFrame(() => {
				div.classList.add('--join');
			});
		});
	},
};

dom.mainMsgInp.addEventListener('paste', (event) => {

	event.preventDefault();

	for(const item of event.clipboardData.items){
		
		if(item.type === 'text/plain'){
			item.getAsString((text) => {

				// 如果有选中文本
				const range = window.getSelection().getRangeAt(0);
				const startOffset = range.startOffset;
				const endOffset = range.endOffset;
				if(startOffset < endOffset){
					// 删除选中文本
					const newText = dom.mainMsgInp.textContent.slice(0, startOffset) + dom.mainMsgInp.textContent.slice(endOffset);
					dom.mainMsgInp.textContent = newText;
					lib.setCaretPos(dom.mainMsgInp, startOffset);
				}

				const maxLength = dom.mainMsgInp.textContent.length + text.length;
			
				text = maxLength > config.maxMsgInpLength ? text.slice(0, config.maxMsgInpLength - maxLength) : text;
					
				// 插入到当前光标处
				const pos = lib.getCaretPos(dom.mainMsgInp);
				const newText = dom.mainMsgInp.textContent.slice(0, pos) + text + dom.mainMsgInp.textContent.slice(pos);
				
				dom.mainMsgInp.textContent = newText;
				// 将光标移动到插入之后的位置
				lib.setCaretPos(dom.mainMsgInp, pos + text.length);
			
				// 触发输入事件
				dom.mainMsgInp.dispatchEvent(new Event('input'));
			});
		}
	}
});

// 全局的文件粘贴
document.body.addEventListener('paste', (event) => {

	event.preventDefault();

	for(const item of event.clipboardData.items){
		
		if(item.type.startsWith('image')){

			const reader = new FileReader();
			reader.onload = (event) => {
				onFile.image(event.target.result);
			};
			reader.readAsDataURL(item.getAsFile());
		}
	}
});

dom.mainFileInp.addEventListener('change', async (event) => {
	const fileList = event.target.files;

	// html 输入框已经限定了文件格式
	
	for(const file of fileList){
		const reader = new FileReader();
		reader.onload = (event) => {
			onFile.image(event.target.result);
		};
		reader.readAsDataURL(file);
	}

	dom.mainFileInp.value = '';
});

// 拖拽进入区域时，高亮显示
document.body.addEventListener('dragover', async (event) => {
	event.preventDefault();
	document.body.classList.add('--fileDragover');
});

// 拖拽离开区域时，取消高亮
document.body.addEventListener('dragleave', async (event) => {
	document.body.classList.remove('--fileDragover');
});

// 文件被放置到区域时，处理文件
document.body.addEventListener('drop', async (event) => {
	event.preventDefault();
	document.body.classList.remove('--fileDragover');
	const files = event.dataTransfer.files;
	for(const file of files){
		if(/^image\//i.test(file.type)){
			const reader = new FileReader();
			reader.onload = (event) => {
				onFile.image(event.target.result);
			};
			reader.readAsDataURL(file);
		}
	}
});

dom.mainMsgInp.addEventListener('keydown', (event) => {
	
	// 自己实现了撤销和重做 :(
	if(event.ctrlKey){
		if(event.key === 'z'){
			event.preventDefault();
			stat.mainMsgInp.stackIdx = stat.mainMsgInp.stackIdx > 0 ? stat.mainMsgInp.stackIdx - 1 : 0;
			const { text, pos } = stat.mainMsgInp.stack[stat.mainMsgInp.stackIdx];
			dom.mainMsgInp.textContent = text;
			lib.setCaretPos(dom.mainMsgInp, pos);
			lib.syncMainInpStat();
		}else if(event.key === 'y'){
			event.preventDefault();
			stat.mainMsgInp.stackIdx = stat.mainMsgInp.stackIdx < stat.mainMsgInp.stack.length - 1 ? stat.mainMsgInp.stackIdx + 1 : stat.mainMsgInp.stack.length - 1;
			const { text, pos } = stat.mainMsgInp.stack[stat.mainMsgInp.stackIdx];
			dom.mainMsgInp.textContent = text;
			lib.setCaretPos(dom.mainMsgInp, pos);
			lib.syncMainInpStat();
		}
		return;
	}
	
	if(event.key === 'Enter'){
		if(!event.shiftKey){
			// 如果文本中已经存在至少一个换行, 则不发送消息
			if(!/\n/.test(dom.mainMsgInp.textContent)){
				event.preventDefault();
				dom.mainSendBtn.click();
			}
		}
	}
});

dom.mainMsgInp.addEventListener('input', (event) => {

	if(dom.mainMsgInp.textContent.length > config.maxMsgInpLength){
		dom.mainMsgInp.textContent = stat.mainMsgInp.text;
		lib.setCaretPos(dom.mainMsgInp, stat.mainMsgInp.pos);
	}else{
		stat.mainMsgInp.text = dom.mainMsgInp.textContent;
		stat.mainMsgInp.pos = lib.getCaretPos(dom.mainMsgInp);

		dom.mainMsgInp.textContent = dom.mainMsgInp.textContent;
		lib.setCaretPos(dom.mainMsgInp, stat.mainMsgInp.pos);

		// 支持撤销功能
		if(stat.mainMsgInp.text !== stat.mainMsgInp.stack[stat.mainMsgInp.stackIdx]?.text){
			if(stat.mainMsgInp.stackIdx < stat.mainMsgInp.stack.length - 1){
				stat.mainMsgInp.stack = stat.mainMsgInp.stack.slice(0, stat.mainMsgInp.stackIdx + 1);
			}
	
			stat.mainMsgInp.stack.push({
				text: stat.mainMsgInp.text,
				pos: stat.mainMsgInp.pos,
			});
			if(stat.mainMsgInp.stack.length > 256){
				stat.mainMsgInp.stack.shift();
			}
			stat.mainMsgInp.stackIdx = stat.mainMsgInp.stack.length - 1;
		}
	}
});

dom.mainMsgInp.addEventListener('click', () => {
	stat.mainMsgInp.pos = lib.getCaretPos(dom.mainMsgInp);
	stat.mainMsgInp.stack[stat.mainMsgInp.stackIdx].pos = stat.mainMsgInp.pos;
	lib.syncMainInpStat();
});

dom.inpFileBox.addEventListener('click', (event) => {
	const target = event.target;
	if(target.classList.contains('li')){
		target.classList.remove('--join');
		setTimeout(() => {
			target.remove();
		}, 220);
	}
});


dom.mainSendBtn.addEventListener('click', async () => {

	if(!(stat.connect && stat.login)){
		return;
	}

	const time = Date.now();
	const dialog = createDialog(time);

	// 收集用户输入
	const uiUserMsgPlugins = [];

	const getUserInp = async () => {
		// 处理输入框
		if(true){
			const inpText = dom.mainMsgInp.textContent.trim().replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF]+/g, '');
			if(inpText){
				lib.clearMainInpStat();
				lib.syncMainInpStat();
				uiUserMsgPlugins.push({ type: 'text', data: { text: inpText }});
			}else{
				return;
			}
		}

		// 处理图片上传
		if(true){
			const imgList = [];

			for(const fileDom of Array.from(dom.inpFileBox.querySelectorAll('.file'))){
				if(fileDom.nodeName === 'IMG'){
					imgList.push(fileDom.src);
					fileDom.parentNode.click();	// 从页面移除这个图片
				}
			}

			if(imgList.length !== 0){
				addMsg(dialog, 'user loading');

				const upFileList = await msgListener.add((msg) => {
					if(msg.type === '// UPLOAD IMAGE BASE64 //'){
						return msg.list;
					}
					return false;
				}, () => {
					socket.send(`// UPLOAD IMAGE BASE64 //\n${imgList.join('\n')}`);
				});
	
				for(const li of upFileList){
					uiUserMsgPlugins.push({ type: 'image', data: { file: li.url, fileId: li.fileId }});
				}
			}
		}

		if(uiUserMsgPlugins.length === 0){
			return;
		}

		return true;
	}

	const getUserInpStat = await getUserInp();

	const loadingDom = dialog.querySelector('.user.loading');
	if(loadingDom){
		delMsg(dialog, loadingDom);
	}

	if(getUserInpStat !== true){
		dialog.remove();
		return;
	}
	
	addMsg(dialog, 'user', renderPluginsMsg(uiUserMsgPlugins, dialog));
	addMsg(dialog, 'ai loading');

	lib.saveMsg('user', uiUserMsgPlugins);
	
	socket.send(JSON.stringify({ type:'userMsg', plugins: uiUserMsgPlugins, time }));
});

dom.mainToolBtn.addEventListener('click', async () => {

	if(dom.mainBtnBox.classList.contains('--toolJoin')){
		dom.mainBtnBox.classList.remove('--toolJoin');
	}else{
		dom.mainBtnBox.classList.add('--toolJoin');
	}

});

document.body.addEventListener('mousedown', (event) => {

	// 右键点击
	if(event.button !== 2){
		stat.copyEl = null;
		return;
	}

	// 不处理已经有用户手动选择的情况
	if(window.getSelection().toString() !== ''){
		if(!stat.copyEl){
			stat.copyEl = null;
			return;
		}
	}

	event.preventDefault();

	let el;

	el = event.target.closest('img');
	if(el){
		stat.copyEl = el;
		return;
	}

	el = event.target.closest('code');
	if(el){
		lib.select(el);
		stat.copyEl = el;
		return;
	}

	el = event.target.closest('table');
	if(el){
		lib.select(el);
		stat.copyEl = el;
		return;
	}

	el = event.target.closest('.katex');
	if(el){
		lib.select(el);
		stat.copyEl = el;
		return;
	}

	el = event.target.closest('.msg');
	if(el){
		lib.select(el);
		stat.copyEl = el;
		return;
	}
	
	stat.copyEl = null;
});

document.addEventListener('copy', (event) => {

	// 存在 data-copy 属性
	if(stat.copyEl){
		event.preventDefault();

		if(stat.copyEl.hasAttribute('data-copy')){
			const copyText = stat.copyEl.getAttribute('data-copy');
			lib.copy(copyText);
		}else{

			// 按顺序遍历这个被选中的元素中的所有子元素, 单独处理存在 data-copy 的和其他元素
			
			const textNodeList = lib.getTextNodeList(stat.copyEl);

			const textList = [];
			const set = new Set();	// 去除已被处理的 data-copy 元素
			
			for(const node of textNodeList){

				const dataCoptEl = node.parentNode.closest('*[data-copy]');
				if(dataCoptEl){
					if(set.has(dataCoptEl)){
						continue;
					}
					if(dataCoptEl){
						set.add(dataCoptEl);
						textList.push(dataCoptEl.getAttribute('data-copy'));
						// 如果这个元素是块级的, 那么需要补全它的换行符
						if(dataCoptEl.classList.contains('--block')){
							textList.push('\n');
						}
					}
				}else{
					textList.push(node.textContent);
				}
			}

			lib.copy(textList.join(''));
		}
	}else{
		const selection = window.getSelection();
		if(selection.toString() === ''){
			return;
		}
		event.preventDefault();

		const textList = [];
		const set = new Set();
		let runFor = false;

		const pushNodeTextContent = (node) => {
			if(node === range.startContainer){
				textList.push(node.textContent.slice(range.startOffset, node.textContent.length));
			}
			else if(node === range.endContainer){
				textList.push(node.textContent.slice(0, range.endOffset));
			}
			else {
				textList.push(node.textContent);
			}
		};

		const range = selection.getRangeAt(0);
		const commonAncestorTextNodeList = lib.getTextNodeList(range.commonAncestorContainer);
		for(const node of commonAncestorTextNodeList){

			// 绕过未选中的节点
			if(node === range.startContainer) runFor = true;
			if(!runFor) continue;
			// 跳过之后的节点
			if(node === range.endContainer) runFor = false;

			const dataCoptEl = node.parentNode.closest('*[data-copy]');

			if(!dataCoptEl){
				pushNodeTextContent(node);
				continue;
			}

			if(set.has(dataCoptEl)){
				continue;
			}

			// 这里是当前可复制整体的第一个文本节点
			// 检查这个可复制整体是否被完全选中

			// const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
			const dataCoptElNodeList = lib.getTextNodeList(dataCoptEl);
			if(node !== dataCoptElNodeList[0]){
				// 这个可复制整体被截断了
				pushNodeTextContent(node);
				continue;
			}

			// 处理这个完整的可复制整体
			set.add(dataCoptEl);
			textList.push(dataCoptEl.getAttribute('data-copy'));
			// 如果这个元素是块级的, 那么需要补全它的换行符
			if(dataCoptEl.classList.contains('--block')){
				textList.push('\n');
			}
		}

		lib.copy(textList.join('').trim());
	}
});

window.addEventListener('scroll', () => {
	if(stat.scroll) return;
	stat.scroll = true;
	setTimeout(() => {
		stat.scroll = false;

		if(!lib.inViewport(dom.mainMsgInp, 0.2)){
			dom.toTopBtn.classList.add('--join');
		}else{
			dom.toTopBtn.classList.remove('--join');
		}

	}, 200);
});

//PWA
if(window.matchMedia('(display-mode: standalone)').matches){
	document.title = '';
}else{
	document.title = 'CiAt';
}

// 启动
Promise.resolve().then(async () => {

	_runWebSocket();

	document.querySelector('.main').classList.remove('--quit');

	lib.syncMainInpStat(true);

	if(true){
		const res = await fetch('./l2/marked-emoji.json');
		const emojis = await res.json();
		marked.use(markedEmoji.markedEmoji({
			emojis: emojis,
			renderer: (token) => `<span class="mdEmoji">${token.emoji}</span>`,
		}));
	}

	setInterval(() => {
		lib.syncMainInpStat();
	}, 300);

	await lib.loadMsg(64);
});

dom.mainMsgInp.focus();
lib.toTop();

// 完成
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
 | People: [ ApliNi, MickyDot ]
 | Code: https://github.com/ApliNi/cat.ipacel.cc
`, 'color: #FF8C00'));
