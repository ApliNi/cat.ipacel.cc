

const socket = new WebSocket('wss://cat.ipacel.cc/config/ws/');

let onLogin = false;

socket.addEventListener('open', () => {
	console.log('[ws] OPEN');

	setInterval(() => {
		socket.send(JSON.stringify({ type: 'keepalive' }));
	}, 30 * 1000);

	socket.send(JSON.stringify({ type: 'login' }));

	const interval = setInterval(() => {
		if(onLogin){
			clearInterval(interval);
		}else{
			socket.send(JSON.stringify({ type: 'login' }));
		}
	}, 7 * 60 * 1000);
});

socket.addEventListener('close', () => {
	console.warn('[ws] CLOSE');
	alert('连接已断开...');
	location.reload();
});

socket.addEventListener('message', async (event) => {
	const msg = JSON.parse(event.data);
	console.log(`[ws] MSG: ${msg.type}`, msg);
	
	if(fn[msg.type]){
		await fn[msg.type](msg);
	}

});

let config = {};

const fn = {

	'login': async (msg) => {
		document.querySelector('#loginData').innerHTML = `
			<p>点击以复制, 将以下指令发送到您需要配置的聊天群组中</p>
			<p class="code" onclick="btn.copy(this.textContent)">!CONFIG ${msg.key}</p>
		`;
	},

	'login_ok': async (msg) => {
		onLogin = true;

		document.getElementById('dog').close();

		config = msg.config;

		renderCfg(config, 'cfg');
	},

	'deploy_ok': async (msg) => {
		document.querySelector('#btn_deploy').classList.remove('--ban');
		document.querySelector('#btn_deploy').classList.add('--light');

		setTimeout(() => {
			document.querySelector('#btn_deploy').classList.remove('--light');
		}, 4 * 1000);
	},

	'deploy_no': async (msg) => {
		document.querySelector('#btn_deploy').classList.remove('--ban');

		alert('配置部署失败: 类型错误');
	},
};

const btn = {
	deploy: async () => {
		document.querySelector('#btn_deploy').classList.add('--ban');
		parseCfg(config, 'cfg');
		console.log(config);
		socket.send(JSON.stringify({ type: 'deploy', config: config }));
	},

	copy: (text) => {
		navigator.clipboard.writeText(text);
	},
};


const renderCfg = (cfg, ...hierarchy) => {
	
	for(const key in cfg){
		const obj = cfg[key];

		if(obj === null || obj === undefined){

		}

		else if(obj.constructor === Boolean){
			document.querySelector(`#${hierarchy.join('_')}_${key}`).checked = obj;
		}

		else if(obj.constructor === Array){
			document.querySelector(`#${hierarchy.join('_')}_${key}`).value = obj.join('\n');
		}

		else if(obj.constructor === String){
			document.querySelector(`#${hierarchy.join('_')}_${key}`).value = obj;
		}

		else if(obj.constructor === Object){
			renderCfg(obj, ...hierarchy, key);
		}
	}
};

const parseCfg = (cfg, ...hierarchy) => {

	for(const key in cfg){
		const obj = cfg[key];

		if(obj === null || obj === undefined){

		}

		else if(obj.constructor === Boolean){
			cfg[key] = document.querySelector(`#${hierarchy.join('_')}_${key}`).checked;
		}

		else if(obj.constructor === Array){
			cfg[key] = document.querySelector(`#${hierarchy.join('_')}_${key}`).value.split(/\n+/);
		}

		else if(obj.constructor === String){
			cfg[key] = document.querySelector(`#${hierarchy.join('_')}_${key}`).value;
		}

		else if(obj.constructor === Object){
			parseCfg(obj, ...hierarchy, key);
		}
	}

	return cfg;
};
