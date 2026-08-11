/* ============================================================
   ACCESSIBILITY & CORS FIX STYLES
   ============================================================ */

/* Skip Link */
.skip-link {
    position: absolute;
    top: -1000px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e40af;
    color: white;
    padding: 12px 24px;
    border-radius: 0 0 8px 8px;
    z-index: 99999;
    font-weight: 700;
    transition: top 0.3s ease;
    text-decoration: none;
}
.skip-link:focus {
    top: 0;
}

/* Screen Reader Only */
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
}

/* Reduced Motion */
.reduced-motion *,
.reduced-motion *::before,
.reduced-motion *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
}

/* Focus Visible */
*:focus-visible {
    outline: 2px solid #1e40af;
    outline-offset: 2px;
}

/* History Container for Virtual Scroller */
.history-container {
    height: 400px;
    overflow: auto;
    position: relative;
}
.history-container table {
    width: 100%;
    border-collapse: collapse;
}
.history-container thead {
    position: sticky;
    top: 0;
    z-index: 10;
    background: #1a1a2e;
}
.history-container tbody tr {
    cursor: pointer;
    transition: background 0.2s ease;
}
.history-container tbody tr:hover {
    background: rgba(30, 64, 175, 0.1);
}
.history-container tbody tr.row-today {
    background: rgba(22, 163, 74, 0.1);
    border-left: 3px solid #16a34a;
}
.history-container tbody tr.row-current {
    background: rgba(30, 64, 175, 0.05);
}
.history-container tbody tr.row-past {
    opacity: 0.8;
}

/* Toast Accessibility */
.notif-modal-content {
    role: alertdialog;
}

/* Loading State */
[aria-busy="true"] {
    cursor: wait;
}
[aria-busy="true"] * {
    pointer-events: none;
}

/* Status Badge Table */
.status-badge-table {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.status-badge-table.alpha {
    background: #dc2626;
    color: white;
}
.status-badge-table.hadir {
    background: #16a34a;
    color: white;
}
.status-badge-table.terlambat {
    background: #facc15;
    color: #1a1a2e;
}
.status-badge-table.izin {
    background: #9333ea;
    color: white;
}
.status-badge-table.sakit {
    background: #2563eb;
    color: white;
}
.status-badge-table.dinas {
    background: #d97706;
    color: white;
}
.status-badge-table.multi-status {
    background: #6b7280;
    color: white;
}

/* Detail Card */
#detailCard {
    display: none;
    margin-top: 20px;
    padding: 20px;
    background: rgba(15, 23, 42, 0.95);
    border-radius: 16px;
    border: 1px solid rgba(30, 64, 175, 0.3);
}
.detail-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.detail-label {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.85rem;
}
.detail-value {
    color: white;
    font-weight: 500;
}
.btn-close-detail {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: white;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
}
.btn-close-detail:hover {
    background: rgba(220, 38, 38, 0.2);
    border-color: #dc2626;
}

/* Responsive */
@media (max-width: 768px) {
    .history-container {
        height: 300px;
    }
    .detail-row {
        flex-direction: column;
        gap: 4px;
    }
    .detail-label {
        font-size: 0.75rem;
    }
    .detail-value {
        font-size: 0.9rem;
    }
}
