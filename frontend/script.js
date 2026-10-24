function $(sel, ctx=document){ return ctx.querySelector(sel); }
function $all(sel, ctx=document){ return Array.from(ctx.querySelectorAll(sel)); }

// Escapes a value before it is placed inside innerHTML (text or attribute).
function escapeHtml(v){
	return String(v === undefined || v === null ? '' : v)
		.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
		.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Inline message (replaces alert()).
let _notifyTimer = null;
function notify(text, type){
	const box = $('#message');
	if(!box){ console.log(text); return; }
	box.textContent = text;
	box.classList.remove('hidden', 'error', 'success');
	box.classList.add(type === 'error' ? 'error' : 'success');
	clearTimeout(_notifyTimer);
	_notifyTimer = setTimeout(()=> box.classList.add('hidden'), 6000);
}

const ERROR_TEXT = {
	'email not verified': 'لم يتم التحقق من بريدك بعد. افحص بريدك الإلكتروني.',
	'invalid credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
	'email taken': 'هذا البريد مسجّل مسبقاً',
	'a valid email is required': 'أدخل بريداً إلكترونياً صحيحاً',
	'registration is temporarily unavailable': 'التسجيل غير متاح حالياً، حاول لاحقاً',
	'invalid': 'كلمة المرور غير صحيحة',
	'admin only': 'هذه الصفحة للمشرف فقط'
};
function errorText(j, fallback){
	const e = j && j.error;
	if(!e) return fallback;
	if(ERROR_TEXT[e]) return ERROR_TEXT[e];
	if(/^password must/.test(e)) return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
	if(/too many/.test(e)) return 'محاولات كثيرة، حاول مرة أخرى لاحقاً';
	return fallback;
}

function showSection(id){
	$all('nav button').forEach(b=>b.classList.toggle('active', b.dataset.target===id));
	$all('.panel').forEach(p=>p.classList.toggle('hidden', p.id!==id));
}

document.addEventListener('click', (e)=>{
	const b = e.target.closest('nav button');
	if(b){ showSection(b.dataset.target); }
});

function getToken(){ return localStorage.getItem('halfaya_token'); }
function setToken(t){ if(t) localStorage.setItem('halfaya_token', t); else localStorage.removeItem('halfaya_token'); }
function getAdminToken(){ return localStorage.getItem('halfaya_admin_token'); }
function setAdminToken(t){ if(t) localStorage.setItem('halfaya_admin_token', t); else localStorage.removeItem('halfaya_admin_token'); }

function submitJson(url, data){
	const headers = {'Content-Type':'application/json'};
	const token = getToken();
	if(token) headers['Authorization'] = 'Bearer ' + token;
	return fetch(url, {
		method: 'POST', headers, body: JSON.stringify(data)
	}).then(r=>r.json());
}

document.addEventListener('DOMContentLoaded', ()=>{
	$all('form[data-service]').forEach(form=>{
		form.addEventListener('submit', async (ev)=>{
			ev.preventDefault();
			const service = form.dataset.service;
			const data = Array.from(new FormData(form)).reduce((acc,[k,v])=>{ acc[k]=v; return acc; },{});
			try{
				const res = await submitJson(`/api/${service}`, data);
				if(res && res.ok){
					notify('تم الإرسال بنجاح');
					form.reset();
				} else {
					notify(errorText(res, 'تعذّر الإرسال، تحقق من الحقول وحاول مرة أخرى'), 'error');
				}
			}catch(err){
				console.error(err);
				notify('خطأ في الاتصال بالخادم', 'error');
			}
		});
	});
});

// Default show
showSection('inquiry');

// --- auth handling ---
function updateAuthUI(){
	const token = getToken();
	const userInfo = $('.user-info');
	const logoutBtn = $('.logout-btn');
	if(token){
		// try fetch /api/me
		fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } })
			.then(r=>r.json())
			.then(j=>{
				if(j && j.ok && j.user){
					userInfo.textContent = 'مسجل باسم: ' + j.user.email;
					logoutBtn.classList.remove('hidden');
				} else {
					userInfo.textContent = 'غير مسجل';
					logoutBtn.classList.add('hidden');
				}
			}).catch(()=>{ userInfo.textContent = 'غير مسجل'; logoutBtn.classList.add('hidden'); });
	} else { userInfo.textContent = 'غير مسجل'; logoutBtn.classList.add('hidden'); }
}

document.addEventListener('submit', (ev)=>{
	const f = ev.target.closest('form[data-auth]');
	if(!f) return;
	ev.preventDefault();
	const mode = f.dataset.auth;
	const data = Array.from(new FormData(f)).reduce((acc,[k,v])=>{ acc[k]=v; return acc; },{});
	fetch(`/api/auth/${mode}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) })
		.then(r=>r.json())
		.then(j=>{
			if(!(j && j.ok)){
				notify(errorText(j, 'فشل الطلب'), 'error');
				return;
			}
			f.reset();
			if(mode === 'login'){
				if(j.token){ setToken(j.token); updateAuthUI(); notify('تم تسجيل الدخول'); }
				else notify('فشل الطلب', 'error');
				return;
			}
			// register: no session is created until the email is verified
			if(j.verifyToken){
				// development server without SMTP returns the token for testing
				const tryVerify = confirm('وضع التطوير: لم يُرسل البريد. هل تريد التحقق الآن باستخدام الرمز؟');
				if(tryVerify){
					fetch(`/api/auth/verify?token=${encodeURIComponent(j.verifyToken)}`).then(r=>r.text()).then(t=>{
						notify(t === 'verified' ? 'تم التحقق، يمكنك تسجيل الدخول الآن' : 'فشل التحقق', t === 'verified' ? undefined : 'error');
					});
					return;
				}
			}
			notify('تم التسجيل. افحص بريدك الإلكتروني للتحقق ثم سجّل الدخول.');
		}).catch(err=>{ console.error(err); notify('خطأ في الاتصال', 'error'); });
});

document.addEventListener('click', (e)=>{
	if(e.target.closest('.logout-btn')){
		setToken(null); updateAuthUI(); notify('تم تسجيل الخروج');
	}
});

updateAuthUI();

// --- admin UI ---
function updateAdminUI(){
	const token = getAdminToken();
	const loginForm = $('#adminLoginForm');
	const logoutBtn = $('#adminLogoutBtn');
	const controls = $('.admin-controls');
	if(token){ loginForm.classList.add('hidden'); logoutBtn.classList.remove('hidden'); controls.classList.remove('hidden'); }
	else { loginForm.classList.remove('hidden'); logoutBtn.classList.add('hidden'); controls.classList.add('hidden'); }
}

document.addEventListener('submit', (ev)=>{
	const f = ev.target.closest('#adminLoginForm');
	if(!f) return;
	ev.preventDefault();
	const data = Array.from(new FormData(f)).reduce((acc,[k,v])=>{ acc[k]=v; return acc; },{});
	fetch('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) })
		.then(r=>r.json()).then(j=>{
			if(j && j.ok && j.token){ setAdminToken(j.token); updateAdminUI(); notify('تم دخول المشرف'); f.reset(); }
			else notify(errorText(j, 'فشل دخول المشرف'), 'error');
		}).catch(err=>{ console.error(err); notify('خطأ في الاتصال', 'error'); });
});

document.addEventListener('click', (e)=>{
	if(e.target && e.target.id === 'adminLogoutBtn'){ setAdminToken(null); updateAdminUI(); notify('تم خروج المشرف'); }
	if(e.target && e.target.id === 'loadUsersBtn'){
		const token = getAdminToken(); if(!token){ notify('سجّل دخول المشرف أولاً', 'error'); return; }
		fetch('/api/admin/users', { headers: { 'Authorization': 'Bearer ' + token } }).then(r=>r.json()).then(j=>{
			if(j && j.ok){ renderUsers(j.users || []); } else notify('فشل جلب المستخدمين', 'error');
		}).catch(err=>{ console.error(err); notify('خطأ في الاتصال', 'error'); });
	}
	if(e.target && e.target.id === 'loadEntriesBtn'){
		const token = getAdminToken(); if(!token){ notify('سجّل دخول المشرف أولاً', 'error'); return; }
		const svc = $('#serviceFilter').value || '';
		const url = svc ? ('/api/admin/entries?service=' + encodeURIComponent(svc)) : '/api/admin/entries';
		fetch(url, { headers: { 'Authorization': 'Bearer ' + token } }).then(r=>r.json()).then(j=>{
			if(j && j.ok){ renderEntries(j.entries || []); } else notify('فشل جلب الإدخالات', 'error');
		}).catch(err=>{ console.error(err); notify('خطأ في الاتصال', 'error'); });
	}
	// delete user
	if(e.target && e.target.classList && e.target.classList.contains('del-user')){
		const id = e.target.dataset.id;
		if(!confirm('هل تريد حذف المستخدم؟')) return;
		const token = getAdminToken(); if(!token){ notify('سجّل دخول المشرف أولاً', 'error'); return; }
		fetch('/api/admin/users/' + encodeURIComponent(id), { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } })
			.then(r=>r.json()).then(j=>{
				if(j && j.ok){ notify('تم الحذف'); $('#loadUsersBtn').click(); } else notify(errorText(j, 'فشل الحذف'), 'error');
			}).catch(err=>{ console.error(err); notify('خطأ في الاتصال', 'error'); });
	}
	// delete entry
	if(e.target && e.target.classList && e.target.classList.contains('del-entry')){
		const id = e.target.dataset.id;
		if(!confirm('هل تريد حذف الإدخال؟')) return;
		const token = getAdminToken(); if(!token){ notify('سجّل دخول المشرف أولاً', 'error'); return; }
		fetch('/api/admin/entries/' + encodeURIComponent(id), { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } })
			.then(r=>r.json()).then(j=>{
				if(j && j.ok){ notify('تم الحذف'); $('#loadEntriesBtn').click(); } else notify(errorText(j, 'فشل الحذف'), 'error');
			}).catch(err=>{ console.error(err); notify('خطأ في الاتصال', 'error'); });
	}
});

// Every value coming from the server goes through escapeHtml before innerHTML.
function renderUsers(users){
	const c = $('#adminUsers');
	if(!users.length) return void (c.innerHTML = '<p>لا يوجد مستخدمين</p>');
	const rows = users.map(u=>`<tr><td>${escapeHtml(u.id)}</td><td>${escapeHtml(u.email)}</td><td>${u.verified? 'نعم':'لا'}</td><td>${escapeHtml(u.createdAt)}</td><td><button class="del-user" data-id="${escapeHtml(u.id)}">حذف</button></td></tr>`).join('');
	c.innerHTML = `<h3>المستخدمون</h3><table class="admin-table"><thead><tr><th>id</th><th>email</th><th>verified</th><th>createdAt</th><th>إجراءات</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderEntries(entries){
	const c = $('#adminEntries');
	if(!entries.length) return void (c.innerHTML = '<p>لا توجد إدخالات</p>');
	const rows = entries.map(e=>`<tr><td>${escapeHtml(e.id)}</td><td>${escapeHtml(e.service)}</td><td><pre>${escapeHtml(JSON.stringify(e.data,null,2))}</pre></td><td>${escapeHtml(e.userId)}</td><td>${escapeHtml(e.timestamp)}</td><td><button class="del-entry" data-id="${escapeHtml(e.id)}">حذف</button></td></tr>`).join('');
	c.innerHTML = `<h3>الإدخالات</h3><table class="admin-table"><thead><tr><th>id</th><th>service</th><th>data</th><th>userId</th><th>timestamp</th><th>إجراءات</th></tr></thead><tbody>${rows}</tbody></table>`;
}

updateAdminUI();
