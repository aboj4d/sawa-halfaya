function $(sel, ctx=document){ return ctx.querySelector(sel); }
function $all(sel, ctx=document){ return Array.from(ctx.querySelectorAll(sel)); }

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
					alert('تم الإرسال بنجاح');
					form.reset();
				} else {
					alert('حدث خطأ، حاول مرة أخرى');
				}
			}catch(err){
				console.error(err);
				alert('خطأ في الاتصال بالخادم');
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
				if(j && j.ok && j.token){
					setToken(j.token); updateAuthUI(); alert('تم ' + (mode==='register'? 'التسجيل':'تسجيل الدخول'));
					f.reset();
					// if server returned verifyToken (no SMTP), show it to user
					if(j.verifyToken){
						const tryVerify = confirm('تم التسجيل لكن البريد لم يُرسل آلياً. هل تريد التحقق الآن باستخدام الرمز؟');
						if(tryVerify){
							fetch(`/api/auth/verify?token=${encodeURIComponent(j.verifyToken)}`).then(r=>r.text()).then(t=>{ alert('التحقق: '+t); updateAuthUI(); });
						}
					}
				} else {
					alert((j && j.error) || 'فشل الطلب');
				}
			}).catch(err=>{ console.error(err); alert('خطأ في الاتصال'); });
});

document.addEventListener('click', (e)=>{
	if(e.target.closest('.logout-btn')){
		setToken(null); updateAuthUI(); alert('تم تسجيل الخروج');
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
			if(j && j.ok && j.token){ setAdminToken(j.token); updateAdminUI(); alert('تم دخول المشرف'); f.reset(); }
			else alert((j && j.error) || 'فشل دخول المشرف');
		}).catch(err=>{ console.error(err); alert('خطأ في الاتصال'); });
});

document.addEventListener('click', (e)=>{
	if(e.target && e.target.id === 'adminLogoutBtn'){ setAdminToken(null); updateAdminUI(); alert('تم خروج المشرف'); }
	if(e.target && e.target.id === 'loadUsersBtn'){
		const token = getAdminToken(); if(!token){ alert('سجّل دخول المشرف أولاً'); return; }
		fetch('/api/admin/users', { headers: { 'Authorization': 'Bearer ' + token } }).then(r=>r.json()).then(j=>{
			if(j && j.ok){ renderUsers(j.users || []); } else alert('فشل جلب المستخدمين');
		}).catch(err=>{ console.error(err); alert('خطأ في الاتصال'); });
	}
	if(e.target && e.target.id === 'loadEntriesBtn'){
		const token = getAdminToken(); if(!token){ alert('سجّل دخول المشرف أولاً'); return; }
		const svc = $('#serviceFilter').value || '';
		const url = svc ? ('/api/admin/entries?service=' + encodeURIComponent(svc)) : '/api/admin/entries';
		fetch(url, { headers: { 'Authorization': 'Bearer ' + token } }).then(r=>r.json()).then(j=>{
			if(j && j.ok){ renderEntries(j.entries || []); } else alert('فشل جلب الإدخالات');
		}).catch(err=>{ console.error(err); alert('خطأ في الاتصال'); });
	}
	// delete user
	if(e.target && e.target.classList && e.target.classList.contains('del-user')){
		const id = e.target.dataset.id;
		if(!confirm('هل تريد حذف المستخدم؟')) return;
		const token = getAdminToken(); if(!token){ alert('سجّل دخول المشرف أولاً'); return; }
		fetch('/api/admin/users/' + encodeURIComponent(id), { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } })
			.then(r=>r.json()).then(j=>{
				if(j && j.ok){ alert('تم الحذف'); $('#loadUsersBtn').click(); } else alert((j && j.error) || 'فشل الحذف');
			}).catch(err=>{ console.error(err); alert('خطأ في الاتصال'); });
	}
	// delete entry
	if(e.target && e.target.classList && e.target.classList.contains('del-entry')){
		const id = e.target.dataset.id;
		if(!confirm('هل تريد حذف الإدخال؟')) return;
		const token = getAdminToken(); if(!token){ alert('سجّل دخول المشرف أولاً'); return; }
		fetch('/api/admin/entries/' + encodeURIComponent(id), { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } })
			.then(r=>r.json()).then(j=>{
				if(j && j.ok){ alert('تم الحذف'); $('#loadEntriesBtn').click(); } else alert((j && j.error) || 'فشل الحذف');
			}).catch(err=>{ console.error(err); alert('خطأ في الاتصال'); });
	}
});

function renderUsers(users){
	const c = $('#adminUsers');
	if(!users.length) return void (c.innerHTML = '<p>لا يوجد مستخدمين</p>');
	const rows = users.map(u=>`<tr><td>${u.id}</td><td>${u.email}</td><td>${u.verified? 'نعم':'لا'}</td><td>${u.createdAt || ''}</td><td><button class="del-user" data-id="${u.id}">حذف</button></td></tr>`).join('');
	c.innerHTML = `<h3>المستخدمون</h3><table class="admin-table"><thead><tr><th>id</th><th>email</th><th>verified</th><th>createdAt</th><th>إجراءات</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderEntries(entries){
	const c = $('#adminEntries');
	if(!entries.length) return void (c.innerHTML = '<p>لا توجد إدخالات</p>');
	const rows = entries.map(e=>`<tr><td>${e.id}</td><td>${e.service}</td><td><pre>${escapeHtml(JSON.stringify(e.data,null,2))}</pre></td><td>${e.userId||''}</td><td>${e.timestamp}</td><td><button class="del-entry" data-id="${e.id}">حذف</button></td></tr>`).join('');
	c.innerHTML = `<h3>الإدخالات</h3><table class="admin-table"><thead><tr><th>id</th><th>service</th><th>data</th><th>userId</th><th>timestamp</th><th>إجراءات</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

updateAdminUI();
