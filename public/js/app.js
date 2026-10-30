(function () {
  'use strict';

  // ───── القائمة الرئيسية للجوال ─────
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('mainnav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // ───── القائمة الفرعية (إشعارات ولي الأمر) ─────
  var subs = document.querySelectorAll('.sub-toggle');
  function closeSubs(except) {
    subs.forEach(function (b) {
      if (b !== except) b.setAttribute('aria-expanded', 'false');
    });
  }
  subs.forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = b.getAttribute('aria-expanded') === 'true';
      closeSubs(b);
      b.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.has-sub')) closeSubs(null);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var openBtn = document.querySelector('.sub-toggle[aria-expanded="true"]');
      closeSubs(null);
      if (openBtn) openBtn.focus();
      if (nav && nav.classList.contains('open') && toggle) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    }
  });

  // ───── منع تكرار الإرسال ─────
  document.querySelectorAll('form[data-guard]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (form.dataset.sent === '1') {
        e.preventDefault();
        return;
      }
      var fileErr = form.querySelector('.js-file-err');
      if (fileErr && !fileErr.hidden) {
        e.preventDefault();
        fileErr.scrollIntoView({ block: 'center' });
        return;
      }
      form.dataset.sent = '1';
      var btn = form.querySelector('button[type=submit]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'جارٍ الإرسال…';
      }
    });
  });

  // ───── فحص المرفقات في المتصفح (الفحص الحاسم يتم على الخادم) ─────
  document.querySelectorAll('input[type=file][data-max-mb]').forEach(function (inp) {
    var err = inp.closest('.file-field').querySelector('.js-file-err');
    inp.addEventListener('change', function () {
      var maxMb = parseFloat(inp.dataset.maxMb) || 5;
      var maxFiles = parseInt(inp.dataset.maxFiles, 10) || 1;
      var msg = '';
      var files = Array.prototype.slice.call(inp.files || []);
      if (files.length > maxFiles) msg = 'الحد الأقصى للمرفقات ' + maxFiles + '.';
      files.forEach(function (f) {
        if (msg) return;
        if (f.size > maxMb * 1024 * 1024) msg = 'حجم الملف «' + f.name + '» يتجاوز ' + maxMb + ' ميغابايت.';
        else if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) msg = 'نوع الملف «' + f.name + '» غير مدعوم (PDF أو JPG أو PNG فقط).';
      });
      if (msg) {
        err.textContent = msg;
        err.hidden = false;
        inp.value = '';
      } else {
        err.hidden = true;
      }
    });
  });

  // ───── نسخ النص ─────
  var toast = document.getElementById('toast');
  function showToast(t) {
    if (!toast) return;
    toast.textContent = t;
    toast.hidden = false;
    setTimeout(function () { toast.hidden = true; }, 2600);
  }
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { showToast('تم النسخ'); }, function () { showToast('تعذّر النسخ، انسخه يدويًا'); });
      } else {
        showToast('انسخه يدويًا من الشاشة');
      }
    });
  });
  document.querySelectorAll('[data-print]').forEach(function (b) {
    b.addEventListener('click', function () { window.print(); });
  });
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // ───── ظهور العناصر بهدوء عند التمرير ─────
  var items = document.querySelectorAll('.reveal');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!items.length) return;
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.08 });
  items.forEach(function (el) { io.observe(el); });
})();
