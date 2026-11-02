const form = document.getElementById('test-form');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  document.getElementById('submit-status').textContent = 'Manual submission detected. This test form never transmits data.';
});
for (const radio of document.querySelectorAll('[role="radio"]')) {
  radio.addEventListener('click', () => {
    for (const sibling of radio.parentElement.querySelectorAll('[role="radio"]')) sibling.setAttribute('aria-checked', String(sibling === radio));
  });
}
document.getElementById('shadow-host').attachShadow({ mode: 'open' }).innerHTML = '<style>label{display:flex;flex-direction:column;gap:8px;font:13px system-ui;margin:22px 0}input{border:1px solid #cbd8be;border-radius:6px;padding:12px;background:#fff}</style><label>GitHub profile<input name="githubUrl" type="url"/></label>';
document.getElementById('add-field').addEventListener('click', (event) => {
  document.getElementById('dynamic').innerHTML = '<label>Mobile number<input name="mobileNumber" type="tel" autocomplete="tel"/></label>';
  event.currentTarget.disabled = true;
});
