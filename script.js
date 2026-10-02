// ============================================================
// BOOKBORROW - SUPABASE CONFIGURATION
// ============================================================
// Replace these two values with your Supabase project values.
// Use the browser-safe PUBLISHABLE/anon key, NEVER service_role.
// ============================================================

const SUPABASE_URL = "https://fjveodmhduthmdsvncac.supabase.co/";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdmVvZG1oZHV0aG1kc3ZuY2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NTEyNzEsImV4cCI6MjEwNjUyNzI3MX0.lxn_nE-wrqnh3tNr3aBBGAsB_O04CBshHtGi2aAW7eo";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// DOM
const booksGrid = document.getElementById("booksGrid");
const loansList = document.getElementById("loansList");
const searchInput = document.getElementById("searchInput");
const borrowForm = document.getElementById("borrowForm");
const bookForm = document.getElementById("bookForm");
const borrowBook = document.getElementById("borrowBook");
const message = document.getElementById("message");
const totalBooks = document.getElementById("totalBooks");
const availableCopies = document.getElementById("availableCopies");
const activeLoans = document.getElementById("activeLoans");
const refreshBtn = document.getElementById("refreshBtn");

let books = [];
let loans = [];

function showMessage(text, type = "success") {
  message.textContent = text;
  message.className = `message ${type}`;

  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    message.className = "message hidden";
  }, 4500);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(dateString) {
  if (!dateString) return "—";

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(`${dateString}T00:00:00`));
}

function isOverdue(dateString) {
  if (!dateString) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(`${dateString}T00:00:00`);
  return due < today;
}

function renderBooks() {
  const query = searchInput.value.trim().toLowerCase();

  const filtered = books.filter(book => {
    const searchable = [
      book.title,
      book.author,
      book.isbn,
      book.category
    ].join(" ").toLowerCase();

    return searchable.includes(query);
  });

  if (filtered.length === 0) {
    booksGrid.innerHTML = `<div class="empty">No books found.</div>`;
    return;
  }

  booksGrid.innerHTML = filtered.map(book => {
    const available = Number(book.available_copies) > 0;

    return `
      <article class="book-card">
        <div class="book-icon">📖</div>
        <h4>${escapeHTML(book.title)}</h4>
        <div class="book-author">by ${escapeHTML(book.author)}</div>

        <div class="book-meta">
          ${book.category ? `Category: ${escapeHTML(book.category)}<br>` : ""}
          ${book.isbn ? `ISBN: ${escapeHTML(book.isbn)}<br>` : ""}
          ${Number(book.available_copies)} of ${Number(book.total_copies)} copies available
        </div>

        <div class="book-footer">
          <span class="${available ? "available" : "unavailable"}">
            ${available ? "Available" : "Checked out"}
          </span>
          <button
            class="primary-btn borrow-from-card"
            data-book-id="${book.id}"
            ${available ? "" : "disabled"}
          >
            Borrow
          </button>
        </div>
      </article>
    `;
  }).join("");

  document.querySelectorAll(".borrow-from-card").forEach(button => {
    button.addEventListener("click", () => {
      borrowBook.value = button.dataset.bookId;
      document.getElementById("borrowerName").focus();
      document.getElementById("borrowForm").scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });
  });
}

function renderBorrowBookOptions() {
  const availableBooks = books.filter(book => Number(book.available_copies) > 0);

  borrowBook.innerHTML = `
    <option value="">Select a book...</option>
    ${availableBooks.map(book => `
      <option value="${book.id}">
        ${escapeHTML(book.title)} — ${escapeHTML(book.author)}
      </option>
    `).join("")}
  `;
}

function renderLoans() {
  if (loans.length === 0) {
    loansList.innerHTML = `<div class="empty">No active loans.</div>`;
    return;
  }

  loansList.innerHTML = loans.map(loan => {
    const overdue = isOverdue(loan.due_date);

    return `
      <div class="loan">
        <div>
          <div class="loan-title">${escapeHTML(loan.books?.title || "Unknown book")}</div>
          <div class="loan-details">
            Borrower: ${escapeHTML(loan.borrower_name)}
            · Due: <span class="${overdue ? "due-soon" : ""}">
              ${formatDate(loan.due_date)}${overdue ? " · OVERDUE" : ""}
            </span>
          </div>
        </div>

        <div class="loan-details">
          Borrowed ${formatDate(loan.borrowed_at?.slice(0, 10))}
        </div>

        <button
          class="danger-btn return-btn"
          data-loan-id="${loan.id}"
          data-book-id="${loan.book_id}"
        >
          Return
        </button>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".return-btn").forEach(button => {
    button.addEventListener("click", () => {
      returnBook(button.dataset.loanId, button.dataset.bookId);
    });
  });
}

function renderStats() {
  totalBooks.textContent = books.reduce(
    (sum, book) => sum + Number(book.total_copies),
    0
  );

  availableCopies.textContent = books.reduce(
    (sum, book) => sum + Number(book.available_copies),
    0
  );

  activeLoans.textContent = loans.length;
}

async function loadBooks() {
  const { data, error } = await supabaseClient
    .from("books")
    .select("*")
    .order("title");

  if (error) {
    console.error(error);
    throw new Error(`Could not load books: ${error.message}`);
  }

  books = data || [];
}

async function loadLoans() {
  const { data, error } = await supabaseClient
    .from("borrowings")
    .select(`
      id,
      book_id,
      borrower_name,
      borrowed_at,
      due_date,
      books (
        title
      )
    `)
    .is("returned_at", null)
    .order("due_date");

  if (error) {
    console.error(error);
    throw new Error(`Could not load loans: ${error.message}`);
  }

  loans = data || [];
}

async function refresh() {
  try {
    booksGrid.innerHTML = `<div class="loading">Loading books...</div>`;
    loansList.innerHTML = `<div class="loading">Loading loans...</div>`;

    await Promise.all([loadBooks(), loadLoans()]);

    renderBooks();
    renderBorrowBookOptions();
    renderLoans();
    renderStats();
  } catch (error) {
    console.error(error);
    booksGrid.innerHTML = `<div class="empty">Could not load data.</div>`;
    loansList.innerHTML = `<div class="empty">Could not load data.</div>`;
    showMessage(error.message, "error");
  }
}

borrowForm.addEventListener("submit", async event => {
  event.preventDefault();

  const borrowerName = document.getElementById("borrowerName").value.trim();
  const bookId = borrowBook.value;
  const dueDate = document.getElementById("dueDate").value;

  if (!borrowerName || !bookId || !dueDate) {
    showMessage("Please complete all borrowing fields.", "error");
    return;
  }

  const book = books.find(item => item.id === bookId);

  if (!book || Number(book.available_copies) <= 0) {
    showMessage("That book is no longer available.", "error");
    await refresh();
    return;
  }

  const { error: loanError } = await supabaseClient
    .from("borrowings")
    .insert({
      book_id: bookId,
      borrower_name: borrowerName,
      due_date: dueDate
    });

  if (loanError) {
    console.error(loanError);
    showMessage(`Could not create loan: ${loanError.message}`, "error");
    return;
  }

  const { error: bookError } = await supabaseClient
    .from("books")
    .update({
      available_copies: Number(book.available_copies) - 1
    })
    .eq("id", bookId);

  if (bookError) {
    console.error(bookError);
    showMessage(
      "The loan was created, but the copy count could not be updated. Check Supabase.",
      "error"
    );
    await refresh();
    return;
  }

  borrowForm.reset();
  showMessage("Book borrowed successfully.");
  await refresh();
});

async function returnBook(loanId, bookId) {
  if (!confirm("Mark this book as returned?")) return;

  const { error: loanError } = await supabaseClient
    .from("borrowings")
    .update({
      returned_at: new Date().toISOString()
    })
    .eq("id", loanId);

  if (loanError) {
    console.error(loanError);
    showMessage(`Could not return book: ${loanError.message}`, "error");
    return;
  }

  const book = books.find(item => item.id === bookId);

  if (book) {
    const newAvailable = Math.min(
      Number(book.available_copies) + 1,
      Number(book.total_copies)
    );

    const { error: bookError } = await supabaseClient
      .from("books")
      .update({
        available_copies: newAvailable
      })
      .eq("id", bookId);

    if (bookError) {
      console.error(bookError);
      showMessage(
        "The loan was marked returned, but the copy count could not be updated.",
        "error"
      );
      await refresh();
      return;
    }
  }

  showMessage("Book returned successfully.");
  await refresh();
}

bookForm.addEventListener("submit", async event => {
  event.preventDefault();

  const title = document.getElementById("bookTitle").value.trim();
  const author = document.getElementById("bookAuthor").value.trim();
  const isbn = document.getElementById("bookIsbn").value.trim() || null;
  const category = document.getElementById("bookCategory").value.trim() || null;
  const copies = Number(document.getElementById("bookCopies").value);

  if (!title || !author || copies < 1) {
    showMessage("Please enter a title, author, and valid copy count.", "error");
    return;
  }

  const { error } = await supabaseClient
    .from("books")
    .insert({
      title,
      author,
      isbn,
      category,
      total_copies: copies,
      available_copies: copies
    });

  if (error) {
    console.error(error);
    showMessage(`Could not add book: ${error.message}`, "error");
    return;
  }

  bookForm.reset();
  document.getElementById("bookCopies").value = 1;

  showMessage("Book added successfully.");
  await refresh();
});

searchInput.addEventListener("input", renderBooks);
refreshBtn.addEventListener("click", refresh);

// Give the user an obvious configuration error instead of a cryptic one.
if (
  SUPABASE_URL.includes("YOUR_") ||
  SUPABASE_KEY.includes("YOUR_")
) {
  booksGrid.innerHTML = `
    <div class="empty">
      Add your Supabase URL and publishable/anon key in <strong>script.js</strong>
      before using the app.
    </div>
  `;
} else {
  refresh();
}
