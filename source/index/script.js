
    /* =========================================================
      (4) INTERFACE HOOKS (werden von externer Seite überschrieben)
    ========================================================= */
    globalThis.interface = globalThis.interface || {};

    // Session / Navigation
    globalThis.interface.logout = globalThis.interface.logout || (() => {});
    globalThis.interface.onPageChange = globalThis.interface.onPageChange || ((pageId) => {});

    // Exams
    globalThis.interface.openReportPdf = globalThis.interface.openReportPdf || ((examId) => {});
    globalThis.interface.showImages = globalThis.interface.showImages || ((examId) => {});

    // Uploads
    globalThis.interface.uploadExamFiles = globalThis.interface.uploadExamFiles || (async (_examId, _files) => {});
    globalThis.interface.createPatientExam = globalThis.interface.createPatientExam || (async (_meta, _report, _images) => ({ }));

    // Account
    globalThis.interface.saveAccount = globalThis.interface.saveAccount || (async (_data) => {});
    globalThis.interface.changePin = globalThis.interface.changePin || (async () => {});
    globalThis.interface.loginIdAustria = globalThis.interface.loginIdAustria || (async () => {});

    // AI
    globalThis.interface.retrieveAIReport = globalThis.interface.retrieveAIReport || (async (_payload) => ({ resultText: "" }));


    /* =========================================================
      SPA NAVIGATION
    ========================================================= */
    (function initNavigation(){
      const navBtns = Array.from(document.querySelectorAll('nav .nav-link[data-page]'));
      const pages = Array.from(document.querySelectorAll('main .page[data-page]'));

      const searchWrap = document.getElementById('header-search-wrap');
      const searchInput = document.getElementById('exam-search');

      function showPage(pageId){
        pages.forEach(p => p.classList.toggle('is-active', p.getAttribute('data-page') === pageId));

        navBtns.forEach(b => {
          const active = b.getAttribute('data-page') === pageId;
          if (active) b.setAttribute('aria-current','page');
          else b.removeAttribute('aria-current');
        });

        const isExams = (pageId === 'exams');
        if (searchWrap) searchWrap.hidden = !isExams;

        if (searchInput){
          if (!isExams) searchInput.value = '';
          if (isExams) searchInput.dispatchEvent(new Event('input'));
        }

        // Hook
        try { globalThis.interface.onPageChange(pageId); } catch {}

        document.getElementById('main')?.focus?.();
      }

      navBtns.forEach(btn => btn.addEventListener('click', () => showPage(btn.getAttribute('data-page'))));
      showPage('exams');
      window.__susdoxShowPage = showPage;
    })();

    /* =========================================================
      LOGOUT BUTTON -> interface.logout()
    ========================================================= */
    (function initLogout(){
      const btn = document.getElementById('logout-btn');
      if (!btn) return;
      btn.addEventListener('click', () => {
        try { globalThis.interface.logout(); } catch {}
      });
    })();

    /* =========================================================
      UNTERSUCHUNGEN: SUCHFILTER
      - jetzt über #exam-items (dynamic-list)
    ========================================================= */
    (function initExamSearch(){
      const search = document.getElementById('exam-search');
      const list = document.getElementById('exam-items');
      const countEl = document.getElementById('exam-count');
      if (!search || !list || !countEl) return;

      function getText(detailsEl){
        const summary = detailsEl.querySelector('summary')?.innerText || '';
        const body = detailsEl.querySelector('.exam-body')?.innerText || '';
        return (summary + ' ' + body).toLowerCase();
      }

      function apply(){
        const q = (search.value || '').trim().toLowerCase();
        const items = Array.from(list.querySelectorAll('details.exam-item'));

        let visible = 0;
        items.forEach(d => {
          const show = !q || getText(d).includes(q);
          d.style.display = show ? '' : 'none';
          if (show) visible++;
        });

        countEl.textContent = `${visible} Einträge gefunden`;
      }

      search.addEventListener('input', apply);
      apply();
    })();

    /* =========================================================
      OPEN PDF / SHOW IMAGES -> interface hooks
    ========================================================= */
    (function initOpeners(){
      document.addEventListener('click', (e) => {
        const openBtn = e.target.closest('.js-open-report');
        if (openBtn){
          const examId = openBtn.getAttribute('data-exam-id') || null;
          try { globalThis.interface.openReportPdf(examId); } catch {}
          return;
        }
        const imgBtn = e.target.closest('.js-show-images');
        if (imgBtn){
          const examId = imgBtn.getAttribute('data-exam-id') || null;
          try { globalThis.interface.showImages(examId); } catch {}
          return;
        }
      });
    })();

    /* =========================================================
      UPLOADS (bestehende Untersuchungen)
      - nutzt interface.uploadExamFiles()
      - Fallback: ursprüngliches POST /api/upload
    ========================================================= */
    (function initExamUploads(){
      const allowed = ['application/pdf','image/jpeg','image/png'];

      function setStatus(detailsEl, msg, kind){
        const st = detailsEl.querySelector('.status');
        if (!st) return;
        st.classList.remove('is-success','is-error');
        if (kind === 'success') st.classList.add('is-success');
        if (kind === 'error') st.classList.add('is-error');
        st.textContent = msg || '';
      }

      function validate(files){
        const list = Array.from(files || []);
        const valid = list.filter(f => allowed.includes(f.type));
        const invalid = list.filter(f => !allowed.includes(f.type));
        return { valid, invalid };
      }

      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.js-upload-btn');
        if (!btn) return;

        const examId = btn.getAttribute('data-exam-id');
        const detailsEl = btn.closest('details.exam-item');
        const input = detailsEl?.querySelector(`.js-upload-input[data-exam-id="${examId}"]`);
        if (!input) return;

        setStatus(detailsEl, '', null);
        input.click();
      });

      document.addEventListener('change', async (e) => {
        const input = e.target.closest('.js-upload-input');
        if (!input) return;

        const detailsEl = input.closest('details.exam-item');
        const examId = input.getAttribute('data-exam-id');
        const btn = detailsEl?.querySelector(`.js-upload-btn[data-exam-id="${examId}"]`);

        const { valid, invalid } = validate(input.files);

        if (invalid.length) setStatus(detailsEl, 'Nicht unterstützte Datei(en). Bitte nur PDF, JPG oder PNG.', 'error');
        if (!valid.length){ input.value = ''; return; }

        const old = btn ? btn.textContent : '';
        if (btn){ btn.disabled = true; btn.textContent = 'Upload läuft …'; }
        setStatus(detailsEl, 'Upload läuft …', null);

        try{
          if (globalThis.interface?.uploadExamFiles){
            await globalThis.interface.uploadExamFiles(examId, valid);
          } else {
            const fd = new FormData();
            valid.forEach(f => fd.append('files', f));
            fd.append('examId', examId);
            const resp = await fetch('/api/upload', { method:'POST', body: fd });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
          }

          setStatus(detailsEl, 'Upload erfolgreich. Dokument(e) werden verarbeitet.', 'success');
        }catch(err){
          console.error(err);
          setStatus(detailsEl, 'Upload fehlgeschlagen. Bitte später erneut versuchen.', 'error');
        }finally{
          input.value = '';
          if (btn){ btn.disabled = false; btn.textContent = old || 'Dokument hochladen'; }
        }
      });
    })();

    /* =========================================================
      PATIENTEN-UPLOAD: "Eigene Untersuchung hinzufügen"
      - nutzt interface.createPatientExam() (Meta+Dateien)
      - WICHTIG: innerhalb dynamic-list keine weiteren dynamic marker
    ========================================================= */
    (function initOwnExamCreate(){
      const form = document.getElementById('own-exam-form');
      if (!form) return;

      const statusEl = document.getElementById('own-form-status');
      const report = document.getElementById('own-report');
      const images = document.getElementById('own-images');
      const submitBtn = document.getElementById('own-submit-btn');
      const resetBtn = document.getElementById('own-reset-btn');
      const itemsWrap = document.getElementById('exam-items');
      const search = document.getElementById('exam-search');

      function setStatus(msg, kind){
        statusEl.classList.remove('is-success','is-error');
        if (kind === 'success') statusEl.classList.add('is-success');
        if (kind === 'error') statusEl.classList.add('is-error');
        statusEl.textContent = msg || '';
      }

      function fmtDate(iso){
        if (!iso) return '—';
        const [y,m,d] = iso.split('-');
        return (y && m && d) ? `${d}.${m}.${y}` : iso;
      }

      function esc(s){
        return String(s||'')
          .replaceAll('&','&amp;')
          .replaceAll('<','&lt;')
          .replaceAll('>','&gt;')
          .replaceAll('"','&quot;')
          .replaceAll("'","&#039;");
      }

      function renderPatientExam(exam){
        const examId = esc(exam.examId);
        const title = esc(exam.title);
        const sub = esc(exam.provider || 'Patienten-Upload');
        const type = esc(exam.type || 'Sonstiges');
        const dateDE = esc(fmtDate(exam.date));
        const location = esc(exam.location || '—');
        const notes = esc(exam.notes || '');
        const reportName = esc(exam.reportName || '—');
        const imageNames = (exam.imageNames || []).map(esc).join(', ') || '—';

        return `
<details class="exam-item" data-exam-id="${examId}">
  <summary>
    <div class="exam-header-main">
      <div class="exam-folder-icon" aria-hidden="true">
        <svg class="icon icon-lg" viewBox="0 0 24 24">
          <path class="icon-stroke" d="M3 7h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        </svg>
      </div>
      <div class="exam-text-block">
        <div class="exam-title">${title}</div>
        <div class="exam-sub">${sub}</div>
      </div>
    </div>
    <div class="exam-header-meta">
      <span class="exam-date">${dateDE}</span>
      <span class="exam-type">${type} · Patienten-Upload</span>
    </div>
    <div class="exam-chevron" aria-hidden="true">
      <svg class="icon" viewBox="0 0 24 24">
        <path class="icon-stroke" d="M9 18l6-6-6-6"></path>
      </svg>
    </div>
  </summary>

  <div class="exam-body">
    <div class="exam-body-grid">
      <div>
        <div class="exam-body-row"><span class="exam-body-label">Ort:</span><span>${location}</span></div>
        <div class="exam-body-row"><span class="exam-body-label">Status:</span><span>Patienten-Upload gespeichert</span></div>
        ${notes ? `<div class="exam-body-row"><span class="exam-body-label">Hinweis:</span><span>${notes}</span></div>` : ''}
      </div>
      <div>
        <div class="exam-body-row"><span class="exam-body-label">Befund (PDF):</span><span>${reportName}</span></div>
        <div class="exam-body-row"><span class="exam-body-label">Bilder:</span><span>${imageNames}</span></div>
      </div>
    </div>

    <div class="exam-actions">
      <button class="btn-primary js-open-report" data-exam-id="${examId}" type="button" disabled>Befund öffnen (PDF)</button>
      <button class="btn-secondary js-show-images" data-exam-id="${examId}" type="button" disabled>Bilder anzeigen</button>

      <button class="btn-secondary js-ki-explain" data-exam-id="${examId}" type="button">Befund einfach erklären (KI)</button>
      <button class="btn-secondary js-ki-translate" data-exam-id="${examId}" type="button">Befund übersetzen (KI)</button>

      <button class="btn-secondary js-upload-btn" data-exam-id="${examId}" type="button">Weitere Dateien hochladen</button>
      <input class="js-upload-input" data-exam-id="${examId}" type="file" accept=".pdf,image/jpeg,image/png" multiple hidden />
    </div>

    <div class="status" aria-live="polite"></div>
  </div>
</details>`;
      }

      resetBtn?.addEventListener('click', () => { form.reset(); setStatus('', null); });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setStatus('', null);

        const data = new FormData(form);
        const title = (data.get('title')||'').toString().trim();
        const date = (data.get('date')||'').toString().trim();
        const type = (data.get('type')||'').toString().trim();
        const provider = (data.get('provider')||'').toString().trim();
        const location = (data.get('location')||'').toString().trim();
        const notes = (data.get('notes')||'').toString().trim();

        const reportFile = report?.files?.[0] || null;
        const imageFiles = Array.from(images?.files || []);

        if (!title || !date || !type){
          setStatus('Bitte Titel, Datum und Untersuchungsart ausfüllen.', 'error'); return;
        }
        if (!reportFile || reportFile.type !== 'application/pdf'){
          setStatus('Bitte einen Befund als PDF auswählen.', 'error'); return;
        }
        if (!imageFiles.length){
          setStatus('Bitte mindestens ein Bild (JPG/PNG) auswählen.', 'error'); return;
        }
        if (imageFiles.some(f => !['image/jpeg','image/png'].includes(f.type))){
          setStatus('Bilder bitte nur als JPG oder PNG hochladen.', 'error'); return;
        }

        const old = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Speichern & Upload …';

        let examId = `pat-${Date.now()}`;

        try{
          const meta = { title, date, type, provider, location, notes };
          const res = await globalThis.interface.createPatientExam(meta, reportFile, imageFiles);
          if (res?.examId) examId = String(res.examId);
          setStatus('Gespeichert. Upload erfolgreich – Daten werden verarbeitet.', 'success');
        }catch(err){
          console.error(err);
          setStatus('Gespeichert. Upload derzeit nicht erreichbar.', 'error');
        }finally{
          const exam = {
            examId, title, date, type, provider, location, notes,
            reportName: reportFile?.name,
            imageNames: imageFiles.map(f => f.name)
          };

          const wrapper = document.createElement('div');
          wrapper.innerHTML = renderPatientExam(exam).trim();
          const node = wrapper.firstElementChild;
          if (node && itemsWrap) itemsWrap.insertBefore(node, itemsWrap.firstChild);

          submitBtn.disabled = false;
          submitBtn.textContent = old;
          form.reset();

          if (search) search.dispatchEvent(new Event('input'));
        }
      });
    })();

    /* =========================================================
      ACCOUNT: Edit show/hide + Save -> interface.saveAccount()
    ========================================================= */
    (function initAccount(){
      const editBtn = document.getElementById('account-edit-btn');
      const editCard = document.getElementById('account-edit-card');
      const cancelBtn = document.getElementById('acc-cancel-btn');
      const form = document.getElementById('account-form');
      const statusEl = document.getElementById('account-status');
      const pinBtn = document.getElementById('acc-pin-change-btn');
      const idaBtn = document.getElementById('idaustria-btn');

      if (!editBtn || !editCard) return;

      function setStatus(msg, kind){
        statusEl?.classList.remove('is-success','is-error');
        if (kind === 'success') statusEl?.classList.add('is-success');
        if (kind === 'error') statusEl?.classList.add('is-error');
        if (statusEl) statusEl.textContent = msg || '';
      }

      editCard.hidden = true;

      editBtn.addEventListener('click', () => {
        editCard.hidden = false;
        editCard.scrollIntoView({ behavior:'smooth', block:'start' });
        const first = editCard.querySelector('input,select,textarea');
        first?.focus?.();
      });

      cancelBtn?.addEventListener('click', () => {
        editCard.hidden = true;
      });

      pinBtn?.addEventListener('click', async () => {
        setStatus('', null);
        try{
          await globalThis.interface.changePin();
          setStatus('PIN-Änderung gestartet.', 'success');
        }catch(err){
          console.error(err);
          setStatus('PIN-Änderung fehlgeschlagen.', 'error');
        }
      });

      idaBtn?.addEventListener('click', async () => {
        setStatus('', null);
        try{
          await globalThis.interface.loginIdAustria();
          setStatus('ID Austria Anmeldevorgang gestartet.', 'success');
        }catch(err){
          console.error(err);
          setStatus('ID Austria Anmeldung fehlgeschlagen.', 'error');
        }
      });

      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        setStatus('Speichern …', null);

        const fd = new FormData(form);
        const data = Object.fromEntries(fd.entries());

        try{
          await globalThis.interface.saveAccount(data);
          setStatus('Gespeichert.', 'success');
        }catch(err){
          console.error(err);
          setStatus('Speichern fehlgeschlagen.', 'error');
        }
      });
    })();

    /* =========================================================
      KI MODAL: Öffnen/Schließen + Consent + interface.retrieveAIReport()
    ========================================================= */
    (function initAiModal(){
      const modal = document.getElementById('ai-modal');
      const closeBtn = document.getElementById('ai-close-btn');
      const cancelBtn = document.getElementById('ai-cancel-btn');
      const startBtn = document.getElementById('ai-start-btn');
      const consent = document.getElementById('ai-consent');
      const consentErr = document.getElementById('ai-consent-error');
      const modeSel = document.getElementById('ai-mode');
      const langSel = document.getElementById('ai-lang');
      const notesEl = document.getElementById('ai-notes');
      const statusEl = document.getElementById('ai-status');
      const resultEl = document.getElementById('ai-result');
      const subEl = document.getElementById('ai-modal-sub');

      if (!modal || !startBtn || !consent || !modeSel) return;

      let lastFocus = null;
      let currentExamId = null;

      function setStatus(msg, kind){
        statusEl.classList.remove('is-success','is-error');
        if (kind === 'success') statusEl.classList.add('is-success');
        if (kind === 'error') statusEl.classList.add('is-error');
        statusEl.textContent = msg || '';
      }

      function setResultPlaceholder(){
        resultEl.innerHTML = '<div class="ai-result-placeholder">Hier erscheint die KI-Erklärung oder Übersetzung zum ausgewählten Befund.</div>';
      }

      function open(examId, defaultMode){
        currentExamId = examId || null;
        lastFocus = document.activeElement;

        modeSel.value = defaultMode || 'explain';
        consent.checked = false;
        startBtn.disabled = true;
        notesEl.value = '';
        setStatus('', null);
        if (consentErr) consentErr.style.display = 'none';

        subEl.textContent =
          'Hier können Sie Ihren Befund in einfacher Sprache erklären oder in eine andere Sprache übersetzen lassen. Dieser Service ersetzt keine ärztliche Beratung.';

        setResultPlaceholder();

        modal.hidden = false;
        modal.setAttribute('aria-hidden','false');
        modeSel.focus();
      }

      function close(){
        modal.hidden = true;
        modal.setAttribute('aria-hidden','true');
        currentExamId = null;
        setStatus('', null);
        if (consentErr) consentErr.style.display = 'none';
        setResultPlaceholder();
        if (lastFocus && lastFocus.focus) lastFocus.focus();
      }

      consent.addEventListener('change', () => {
        startBtn.disabled = !consent.checked;
        if (consent.checked && consentErr) consentErr.style.display = 'none';
      });

      closeBtn?.addEventListener('click', close);
      cancelBtn?.addEventListener('click', close);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
      });

      document.addEventListener('keydown', (e) => {
        if (!modal.hidden && e.key === 'Escape') close();
      });

      document.addEventListener('click', (e) => {
        const explainBtn = e.target.closest('.js-ki-explain');
        const translateBtn = e.target.closest('.js-ki-translate');
        if (!explainBtn && !translateBtn) return;

        const btn = explainBtn || translateBtn;
        const examId = btn.getAttribute('data-exam-id')
          || btn.closest('details.exam-item')?.getAttribute('data-exam-id')
          || null;

        open(examId, explainBtn ? 'explain' : 'translate');
      });

      startBtn.addEventListener('click', async () => {
        if (!consent.checked){
          if (consentErr) consentErr.style.display = 'block';
          return;
        }

        const payload = {
          examId: currentExamId,
          mode: modeSel.value,
          targetLanguage: langSel.value,
          notes: (notesEl.value || '').trim()
        };

        startBtn.disabled = true;
        setStatus('KI-Anfrage wird verarbeitet …', null);
        resultEl.textContent = '';

        try{
          const data = await globalThis.interface.retrieveAIReport(payload);
          const text = data?.resultText || data?.text || data?.result || data?.message || 'KI-Ergebnis erhalten.';
          resultEl.textContent = text;
          setStatus('Fertig.', 'success');
        }catch(err){
          const demo =
`[DEMO] ${payload.mode === 'translate' ? 'Übersetzung' : 'Einfache Erklärung'}
Untersuchung: ${payload.examId || '—'}
Zielsprache: ${payload.targetLanguage}
Hinweis: retrieveAIReport() ist nicht implementiert oder schlug fehl.`;
          resultEl.textContent = demo;
          setStatus('Demo-Ergebnis angezeigt.', 'error');
        }finally{
          startBtn.disabled = !consent.checked;
          if (!consent.checked && consentErr) consentErr.style.display = 'block';
        }
      });
    })();
  