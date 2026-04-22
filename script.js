// ============================================================
// ОПРЕДЕЛЕНИЕ СТРАНИЦЫ
// ============================================================
let currentPerson   = null;
let currentCategory = null;
let allPersons      = [];
let currentCardIndex = 0;
let gameFinished    = false;
const isIndexPage = document.querySelector('.main-container') !== null;
const isGamePage  = document.querySelector('.game-container') !== null;

// ============================================================
// ГЛАВНАЯ СТРАНИЦА — ЗАГРУЗКА КАТЕГОРИЙ
// ============================================================
if (isIndexPage) {
  loadCategories();
}

async function loadCategories() {
  const grid = document.getElementById('categories-grid');
  const loadingText = document.getElementById('loading-text');

  try {
    const response = await fetch('categories.json');
    const categories = await response.json();

    if (loadingText) loadingText.remove();

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'btn-category';
      btn.textContent = cat.name;
      btn.addEventListener('click', () => {
        window.location.href = `game.html?category=${encodeURIComponent(cat.name)}`;
      });
      grid.appendChild(btn);
    });

  } catch (err) {
    if (loadingText) loadingText.textContent = 'Ошибка загрузки категорий.';
    console.error('Ошибка загрузки categories.json:', err);
  }
}

// ============================================================
// ИГРОВАЯ СТРАНИЦА
// ============================================================
if (isGamePage) {
  initGamePage();
}


async function initGamePage() {
  const params = new URLSearchParams(window.location.search);
  currentCategory = params.get('category');

  if (!currentCategory) {
    window.location.href = 'index.html';
    return;
  }

  // Находим csvUrl для нужной категории
  let csvUrl;
  try {
    const response = await fetch('categories.json');
    const categories = await response.json();
    const cat = categories.find(c => c.name === currentCategory);
    if (!cat) throw new Error('Категория не найдена');
    csvUrl = cat.csvUrl;
  } catch (err) {
    console.error('Ошибка загрузки categories.json:', err);
    return;
  }

  // Загружаем и парсим CSV
  Papa.parse(csvUrl, {
    download: true,
    skipEmptyLines: true,
    complete: function(results) {
      allPersons = parsePersons(results.data);
      startNewGame();
    },
    error: function(err) {
      console.error('Ошибка загрузки CSV:', err);
    }
  });

  // Обработчики кнопок
  document.getElementById('btn-check').addEventListener('click', handleCheckAnswer);
  document.getElementById('answer-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCheckAnswer();
  });
  document.getElementById('btn-surrender').addEventListener('click', showSurrenderModal);
  document.getElementById('btn-modal-cancel').addEventListener('click', hideSurrenderModal);
  document.getElementById('btn-modal-confirm').addEventListener('click', () => {
    hideSurrenderModal();
    revealAll('surrender');
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    addPlayedPerson(currentCategory, currentPerson.name);
    startNewGame();
  });
  document.getElementById('btn-categories').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
}

// ============================================================
// ПАРСИНГ CSV → МАССИВ ОБЪЕКТОВ
// ============================================================
function parsePersons(rows) {
  const persons = [];

  rows.forEach(row => {
    const name = (row[0] || '').trim();
    if (!name) return;

    const photosRaw = (row[1] || '').trim();
    const photos = photosRaw
      ? photosRaw.split(' ').filter(p => p.trim())
      : [];

    const hints = [];
    for (let i = 2; i + 1 < row.length; i += 2) {
      const association = (row[i]     || '').trim();
      const explanation = (row[i + 1] || '').trim();
      if (association) {
        hints.push({ association, explanation });
      }
    }

    if (hints.length > 0) {
      persons.push({ name, photos, hints });
    }
  });

  return persons;
}

// ============================================================
// СЕССИЯ — СЫГРАННЫЕ ЛИЧНОСТИ
// ============================================================
function getPlayedPersons(category) {
  const stored = sessionStorage.getItem(`played_${category}`);
  return stored ? JSON.parse(stored) : [];
}

function addPlayedPerson(category, name) {
  const played = getPlayedPersons(category);
  if (!played.includes(name)) {
    played.push(name);
    sessionStorage.setItem(`played_${category}`, JSON.stringify(played));
  }
}

function resetPlayedPersons(category) {
  sessionStorage.removeItem(`played_${category}`);
}

function getRandomPerson(persons, category) {
  const played    = getPlayedPersons(category);
  let available   = persons.filter(p => !played.includes(p.name));

  if (available.length === 0) {
    resetPlayedPersons(category);
    available = persons;
  }

  return available[Math.floor(Math.random() * available.length)];
}

// ============================================================
// ЗАПУСК НОВОЙ ИГРЫ
// ============================================================
function startNewGame() {
  currentPerson    = getRandomPerson(allPersons, currentCategory);
  currentCardIndex = 0;
  gameFinished     = false;

  // Сбрасываем UI
  const inputEl = document.getElementById('answer-input');
  inputEl.value = '';
  inputEl.disabled = false;
  inputEl.classList.remove('error');

  document.getElementById('btn-check').disabled = false;
  document.getElementById('btn-surrender').style.display = '';
  document.getElementById('answer-message').textContent = '';
  document.getElementById('answer-message').className = 'answer-message';
  document.getElementById('action-buttons').style.display = 'none';

  // Сбрасываем блок фото
  document.getElementById('photo-block').innerHTML =
    '<span class="question-mark">?</span>';

  // Скрываем имя
  const personNameEl = document.getElementById('person-name');
  personNameEl.textContent = '';
  personNameEl.classList.remove('visible');

  // Рендерим карточки
  renderCards(currentPerson.hints);
}

// ============================================================
// РЕНДЕР КАРТОЧЕК
// ============================================================
function renderCards(hints) {
  const grid = document.getElementById('cards-grid');
  grid.innerHTML = '';

  hints.forEach((hint, index) => {
    const card = document.createElement('div');
    card.className = 'card ' + (index === 0 ? 'available' : 'locked');
    card.dataset.index = index;

    card.innerHTML = `
      <div class="card-inner">
        <div class="card-front">
          <span class="card-icon">?</span>
          <span class="card-number">Подсказка ${index + 1}</span>
        </div>
        <div class="card-back association">${hint.association}</div>
        <div class="card-back explanation">${hint.explanation || '—'}</div>
      </div>
    `;

    card.addEventListener('click', () => handleCardClick(card, index));
    grid.appendChild(card);
  });
}

// ============================================================
// КЛИК ПО КАРТОЧКЕ
// ============================================================
function handleCardClick(card, index) {
  // Во время игры: только доступная карточка
  if (!gameFinished) {
    if (!card.classList.contains('available')) return;

    card.classList.remove('available');
    card.classList.add('flipped');
    currentCardIndex++;

    // Делаем следующую карточку доступной
    const allCards = document.querySelectorAll('.card');
    if (currentCardIndex < allCards.length) {
      allCards[currentCardIndex].classList.remove('locked');
      allCards[currentCardIndex].classList.add('available');
    }
    return;
  }

  // После победы/сдачи: переключение в пояснение
  if (card.classList.contains('clickable-explanation')) {
    card.classList.toggle('show-explanation');
  }
}

// ============================================================
// АЛГОРИТМ ЛЕВЕНШТЕЙНА
// ============================================================
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function isWordMatch(word, target) {
  const dist = levenshtein(word, target);
  const len  = target.length;
  if (len <= 3)  return dist === 0;
  if (len <= 6)  return dist <= 1;
  if (len <= 10) return dist <= 2;
  return dist <= Math.min(3, Math.floor(len * 0.3));
}

function checkAnswer(input, correctName) {
  const normalize      = str => str.toLowerCase().trim().replace(/\s+/g, ' ');
  const toSortedWords  = str => normalize(str).split(' ').sort();

  const inputWords   = toSortedWords(input);
  const correctWords = toSortedWords(correctName);

  if (inputWords.length !== correctWords.length) return false;

  return inputWords.every((word, i) => isWordMatch(word, correctWords[i]));
}

// ============================================================
// ПРОВЕРКА ОТВЕТА
// ============================================================
function handleCheckAnswer() {
  if (gameFinished) return;

  const inputEl   = document.getElementById('answer-input');
  const messageEl = document.getElementById('answer-message');
  const input     = inputEl.value.trim();
  if (!input) return;

  if (checkAnswer(input, currentPerson.name)) {
    messageEl.textContent = '🎉 Верно! Вы угадали!';
    messageEl.className   = 'answer-message correct';
    revealAll('win');
  } else {
    messageEl.textContent = 'Не угадали, попробуйте ещё';
    messageEl.className   = 'answer-message wrong';
    inputEl.classList.add('error');
    setTimeout(() => inputEl.classList.remove('error'), 1000);
  }
}

// ============================================================
// ФИНАЛЬНОЕ СОСТОЯНИЕ (победа или сдача)
// ============================================================
function revealAll(mode) {
  gameFinished = true;

  document.getElementById('answer-input').disabled   = true;
  document.getElementById('btn-check').disabled      = true;
  document.getElementById('btn-surrender').style.display = 'none';
  document.getElementById('action-buttons').style.display = 'flex';

  if (mode === 'surrender') {
    const messageEl = document.getElementById('answer-message');
    messageEl.textContent = `Это: ${currentPerson.name}`;
    messageEl.className   = 'answer-message surrendered';
  }

  // Открываем фото
  revealPhoto();

  // Переворачиваем все оставшиеся карточки и делаем их кликабельными
  document.querySelectorAll('.card').forEach(card => {
    if (!card.classList.contains('flipped')) {
      card.classList.remove('available', 'locked');
      card.classList.add('flipped');
    }
    card.classList.add('clickable-explanation');
  });
}

// ============================================================
// ОТКРЫТИЕ ФОТО
// ============================================================
function revealPhoto() {
  const photoBlock   = document.getElementById('photo-block');
  const personNameEl = document.getElementById('person-name');

  photoBlock.innerHTML = '';

  if (currentPerson.photos.length === 0) {
    showInitials(photoBlock, currentPerson.name);
  } else if (currentPerson.photos.length === 1) {
    const img = document.createElement('img');
    img.src = currentPerson.photos[0];
    img.alt = currentPerson.name;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.onerror = function() {
      const initials = document.createElement('div');
      initials.className = 'person-initials';
      initials.textContent = getInitials(currentPerson.name);
      this.replaceWith(initials);
    };
    photoBlock.appendChild(img);
  } else {
    const photos = currentPerson.photos;
    let currentPhotoIndex = 0;

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'slider-container';
    sliderContainer.title = 'Нажмите для следующего фото';
    sliderContainer.style.cursor = 'pointer';

    const img = document.createElement('img');
    img.src = photos[0];
    img.alt = currentPerson.name;
    img.onerror = function() {
      const initials = document.createElement('div');
      initials.className = 'person-initials';
      initials.textContent = getInitials(currentPerson.name);
      this.replaceWith(initials);
    };

    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'slider-dots';
    photos.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'slider-dot' + (i === 0 ? ' active' : '');
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        goToPhoto(i);
      });
      dotsContainer.appendChild(dot);
    });

    const counter = document.createElement('div');
    counter.className = 'slider-counter';
    counter.textContent = `1 / ${photos.length}`;

    function goToPhoto(index) {
      currentPhotoIndex = index;
      img.src = photos[index];
      counter.textContent = `${index + 1} / ${photos.length}`;
      dotsContainer.querySelectorAll('.slider-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
      });
    }

    sliderContainer.addEventListener('click', () => {
      goToPhoto((currentPhotoIndex + 1) % photos.length);
    });

    sliderContainer.appendChild(img);
    sliderContainer.appendChild(dotsContainer);
    sliderContainer.appendChild(counter);
    photoBlock.appendChild(sliderContainer);
  }

  personNameEl.textContent = currentPerson.name;
  personNameEl.classList.add('visible');
}


function showInitials(container, name) {
  const div = document.createElement('div');
  div.className = 'person-initials';
  div.textContent = getInitials(name);
  container.appendChild(div);
}

function getInitials(name) {
  return name.trim().split(/\s+/).map(w => w[0].toUpperCase()).join('');
}

// ============================================================
// МОДАЛЬНОЕ ОКНО
// ============================================================
function showSurrenderModal() {
  document.getElementById('modal-overlay').classList.add('visible');
}

function hideSurrenderModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
}