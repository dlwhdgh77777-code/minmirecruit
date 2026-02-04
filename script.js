// 1. 설정 및 상태 관리
const CONFIG = {
    positionsUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRNNiXueEJRAoF-XNQQeXP5JF7BmDMBf-DOz1tGmeJHxpNm8LD4aP-HgbNzx4rWkMNg2-QLxxmrW_tj/pub?output=csv',
    applicantsUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRNNiXueEJRAoF-XNQQeXP5JF7BmDMBf-DOz1tGmeJHxpNm8LD4aP-HgbNzx4rWkMNg2-QLxxmrW_tj/pub?gid=1385566723&single=true&output=csv'
};

let rawData = {
    positions: [],
    applicants: []
};

let filteredData = {
    positions: [],
    applicants: [],
    summary: { total: 0, ghost: 0, valid: 0, interview: 0, hired: 0 },
    funnel: { labels: ['전체 지원', '유효 지원', '면접전형', '합격'], values: [0, 0, 0, 0] },
    experience: { labels: ['신입', '3-11개월', '1-3년', '3-5년', '5년 이상'], values: [0, 0, 0, 0, 0] }
};

// 2. 초기화 함수
async function initDashboard() {
    setupNavigation();
    setupFilters();

    // 프로토콜 체크 (매우 중요)
    const isFileProtocol = window.location.protocol === 'file:';
    if (isFileProtocol) {
        showStatus(`
            <div style="text-align: center; padding: 20px;">
                <h2 style="color: #991b1b; margin-bottom: 10px;">⚠️ 잘못된 접근입니다</h2>
                <p style="margin-bottom: 15px;">파일을 직접 열면 구글 데이터 연동이 <b>보안상 차단</b>됩니다.</p>
                <div style="background: #fff; padding: 10px; border-radius: 5px; border: 1px dashed #991b1b; display: inline-block;">
                    방법: <b>launcher.bat</b> 실행 -> <b>http://localhost:8080</b>으로 접속
                </div>
            </div>
        `, true);
        return;
    }

    showStatus('서버 연결 중... (http://localhost:8080)');
    await loadData();
    updateFilteredData();
}

function showStatus(msg, isError = false) {
    let statusEl = document.getElementById('connection-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'connection-status';
        statusEl.style.cssText = 'padding: 15px; margin-bottom: 20px; border-radius: 8px; font-size: 0.95rem; line-height: 1.6; font-weight: 500; transition: all 0.3s;';
        document.querySelector('.main-content').prepend(statusEl);
    }
    statusEl.innerHTML = msg;
    statusEl.style.backgroundColor = isError ? '#fee2e2' : '#f0f9ff';
    statusEl.style.color = isError ? '#991b1b' : '#075985';
    statusEl.style.border = isError ? '1px solid #fecaca' : '1px solid #bae6fd';
}

// 3. 데이터 로드 및 파싱 (순차적 페칭 및 상세 로깅)
async function loadData() {
    try {
        // 1. 포지션 정보 로드
        showStatus('데이터를 가져오는 중 (1/2: 포지션 목록)...');
        const posRes = await fetch(CONFIG.positionsUrl);
        if (!posRes.ok) throw new Error(`포지션 시트 응답 에러: ${posRes.status}`);
        const posText = await posRes.text();
        parsePositions(parseCSVRows(posText));

        // 2. 지원자 정보 로드
        showStatus(`포지션(${rawData.positions.length}개) 로드 완료. (2/2: 지원자 상세 내역) 가져오는 중...`);
        const appRes = await fetch(CONFIG.applicantsUrl);
        if (!appRes.ok) throw new Error(`지원자 시트 응답 에러: ${appRes.status}`);
        const appText = await appRes.text();
        parseApplicants(parseCSVRows(appText));

        showStatus(`✅ 데이터 연동 성공! (포지션: ${rawData.positions.length}개, 지원자: ${rawData.applicants.length}명)`);
    } catch (error) {
        console.error('데이터 로드 에러:', error);
        let errorHint = '';

        if (error.message.includes('fetch')) {
            errorHint = `
                <br><b>[예상 원인: 브라우저 보안 또는 광고 차단]</b><br>
                1. <b>광고 차단 프로그램(AdBlock, uBlock 등)</b>이 실행 중이라면 이 페이지에서 꺼주세요.<br>
                2. 브라우저의 <b>'보안 정책(Tracking Prevention)'</b>이 '엄격'으로 되어 있는지 확인해 주세요.<br>
                3. <b>[Ctrl + Shift + N]</b>을 눌러 시크릿(InPrivate) 모드에서 실행해 보세요.
            `;
        }

        const errorMsg = `
            ❌ 데이터 연동 실패: ${error.message}<br>
            <div style="margin-top: 10px; font-size: 0.85rem; color: #4b5563;">
                ${errorHint}
                <br><b>[데이터 주소 수동 확인]</b><br>
                &nbsp;&nbsp; - <a href="${CONFIG.positionsUrl}" target="_blank" style="color: blue; text-decoration: underline;">포지션 시트 확인</a> / 
                <a href="${CONFIG.applicantsUrl}" target="_blank" style="color: blue; text-decoration: underline;">지원자 내역 확인</a><br>
                (위 링크 클릭 시 파일이 정상적으로 다운로드된다면, 구글 설정보다는 브라우저 확장 프로그램 문제일 확률이 높습니다.)
            </div>
        `;
        showStatus(errorMsg, true);
    }
}

// 따옴표를 고려한 CSV 파싱 함수
function parseCSVRows(csvText) {
    const rows = csvText.split(/\r?\n/);
    return rows.map(row => {
        const result = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < row.length; i++) {
            const char = row[i];
            if (char === '"') inQuote = !inQuote;
            else if (char === ',' && !inQuote) {
                result.push(cur);
                cur = '';
            } else cur += char;
        }
        result.push(cur);
        return result;
    });
}

function parsePositions(rows) {
    const positions = [];
    rows.forEach((col, i) => {
        if (i < 2 || !col[1]) return;
        if (col[1].trim() === '포지션명') return;
        positions.push({
            name: col[1].trim(),
            department: col[2] ? col[2].trim() : '',
            minExp: col[3] ? col[3].trim() : ''
        });
    });
    rawData.positions = positions;
}

function parseApplicants(rows) {
    const applicants = [];
    rows.forEach((col, i) => {
        if (i < 2 || !col[1]) return;
        if (col[1].trim() === '지원자명') return;

        // 날짜 파싱 시도 (컬럼 위치 유연하게 대응)
        let dateVal = null;
        for (let field of col) {
            if (field && field.includes('/')) {
                dateVal = parseKoreanDate(field);
                if (dateVal) break;
            }
        }

        applicants.push({
            name: col[1].trim(),
            department: col[2] ? col[2].trim() : '',
            position: col[3] ? col[3].trim() : '',
            date: dateVal,
            experience: col[5] ? col[5].trim() : '0',
            status: col[6] ? col[6].trim() : '서류검토'
        });
    });
    rawData.applicants = applicants;
}

function parseKoreanDate(dateStr) {
    if (!dateStr) return null;
    const clean = dateStr.trim().replace(/"/g, '');
    const parts = clean.split('/');
    if (parts.length !== 3) return null;
    const year = 2000 + parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
}

function parseExpToMonths(str) {
    if (!str) return 0;
    const s = str.trim();
    if (s.includes('년')) return (parseFloat(s) || 0) * 12;
    if (s.includes('개월')) return parseFloat(s) || 0;
    return parseFloat(s) || 0;
}

// 4. 필터 로직
function setupFilters() {
    const inputs = ['start-date', 'end-date', 'pos-search'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateFilteredData);
    });

    const resetBtn = document.getElementById('reset-filter');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            inputs.forEach(id => document.getElementById(id).value = '');
            updateFilteredData();
        });
    }
}

function updateFilteredData() {
    const startVal = document.getElementById('start-date').value;
    const endVal = document.getElementById('end-date').value;
    const startDate = startVal ? new Date(startVal) : null;
    const endDate = endVal ? new Date(endVal) : null;
    if (endDate) endDate.setHours(23, 59, 59); // 종료일은 해당 날짜 끝까지

    const searchTerm = document.getElementById('pos-search').value.toLowerCase().trim();

    filteredData.applicants = rawData.applicants.filter(app => {
        const matchPosition = !searchTerm || (app.position && app.position.toLowerCase().includes(searchTerm)) || (app.name && app.name.toLowerCase().includes(searchTerm));
        const matchDate = (!startDate || (app.date && app.date >= startDate)) && (!endDate || (app.date && app.date <= endDate));
        return matchPosition && matchDate;
    });

    calculateStats();
    renderDashboard();
}

function calculateStats() {
    const apps = filteredData.applicants || [];

    // 포지션별 최소 경력 매핑 (개월 수로 변환)
    const posMinExpMap = {};
    rawData.positions.forEach(p => {
        posMinExpMap[p.name] = parseExpToMonths(p.minExp);
    });

    const isGhost = (app) => {
        // 1. 상태값에 '허수'가 포함된 경우
        if (app.status && app.status.includes('허수')) return true;
        // 2. 포지션 최소 경력보다 부족한 경우 (자동 판별)
        const minMonths = posMinExpMap[app.position] || 0;
        const appMonths = parseExpToMonths(app.experience);
        return appMonths < minMonths;
    };

    const hasStatus = (app, keyword) => app.status && app.status.toLowerCase().includes(keyword.toLowerCase());

    // 요약 지표 (사용자 요청: 효율 중심 개편)
    filteredData.summary.total = apps.length;
    filteredData.summary.ghost = apps.filter(a => isGhost(a)).length;
    filteredData.summary.valid = apps.filter(a => !isGhost(a)).length;
    filteredData.summary.interview = apps.filter(a => !isGhost(a) && (hasStatus(a, '면접') || hasStatus(a, '합격'))).length;
    filteredData.summary.hired = apps.filter(a => !isGhost(a) && hasStatus(a, '합격')).length;

    // 깔대기 차트 (전체 -> 유효 -> 면접 -> 합격)
    filteredData.funnel.values = [
        filteredData.summary.total,
        filteredData.summary.valid,
        filteredData.summary.interview,
        filteredData.summary.hired
    ];

    // 경력 통계 (신입, 3-11개월, 1-3년, 3-5년, 5년 이상)
    const expCounts = [0, 0, 0, 0, 0];
    apps.forEach(a => {
        const months = parseExpToMonths(a.experience);
        if (months === 0) expCounts[0]++; // 신입
        else if (months < 12) expCounts[1]++; // 1-11개월 (사용자 요청 3-11개월 포함)
        else if (months < 36) expCounts[2]++; // 1-3년
        else if (months < 60) expCounts[3]++; // 3-5년
        else expCounts[4]++; // 5년 이상
    });
    filteredData.experience.values = expCounts;

    // 포지션 테이블 데이터
    const searchTermEl = document.getElementById('pos-search');
    const tableSearch = searchTermEl ? searchTermEl.value.toLowerCase().trim() : '';

    filteredData.positions = rawData.positions
        .filter(p => !tableSearch || p.name.toLowerCase().includes(tableSearch))
        .map(p => {
            const posApps = apps.filter(a => a.position === p.name);
            return {
                ...p,
                applicants: posApps.length,
                ghost: posApps.filter(a => isGhost(a)).length,
                interview: posApps.filter(a => !isGhost(a) && (hasStatus(a, '면접') || hasStatus(a, '합격'))).length,
                hired: posApps.filter(a => !isGhost(a) && hasStatus(a, '합격')).length
            };
        });
}

function renderDashboard() {
    updateSummaryUI();
    try { renderFunnelChart(); } catch (e) { console.error('Funnel chart error:', e); }
    try { renderExperienceChart(); } catch (e) { console.error('Experience chart error:', e); }
    renderPositionTable();
}

function updateSummaryUI() {
    const s = filteredData.summary;
    const total = s.total || 1; // 0나누기 방지
    const valid = s.valid || 1;

    document.getElementById('total-applicants').innerText = s.total;
    document.getElementById('ghost-applicants').innerText = s.ghost;
    document.getElementById('valid-applicants').innerText = s.valid;
    document.getElementById('interviewing').innerText = s.interview;
    document.getElementById('hired').innerText = s.hired;

    // 퍼센테이지 업데이트
    const ghostRate = Math.round((s.ghost / total) * 100);
    const validRate = Math.round((s.valid / total) * 100);
    const interviewRate = Math.round((s.interview / (s.valid || 1)) * 100);
    const hiredRate = Math.round((s.hired / (s.valid || 1)) * 100);

    document.getElementById('ghost-rate').innerText = `허수율 ${ghostRate}%`;
    document.getElementById('valid-rate').innerText = `유효율 ${validRate}%`;
    document.getElementById('interview-rate').innerText = `면접 전환율 ${interviewRate}%`;
    document.getElementById('hired-rate').innerText = `최종 합격률 ${hiredRate}%`;
}

function renderFunnelChart() {
    const ctx = document.getElementById('funnelChart').getContext('2d');
    if (window.funnelChartInst) window.funnelChartInst.destroy();
    window.funnelChartInst = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: filteredData.funnel.labels,
            datasets: [{ label: '인원 수', data: filteredData.funnel.values, backgroundColor: '#4f46e5', borderRadius: 8 }]
        },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { display: false } } }
    });
}

function renderExperienceChart() {
    const ctx = document.getElementById('experienceChart').getContext('2d');
    if (window.expChartInst) window.expChartInst.destroy();
    window.expChartInst = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: filteredData.experience.labels,
            datasets: [{ data: filteredData.experience.values, backgroundColor: ['#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#3730a3'], borderWidth: 0 }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderPositionTable() {
    const tbody = document.getElementById('position-table-body');
    if (!tbody) return;
    tbody.innerHTML = filteredData.positions.map(p => `
        <tr>
            <td><strong>${p.name}</strong> <small style="color: #6b7280; font-weight: normal;">(${p.department})</small></td>
            <td><span class="badge ${p.applicants > 0 ? 'badge-open' : 'badge-closed'}">${p.applicants > 0 ? '채용중' : '대기'}</span></td>
            <td>${p.applicants}명</td>
            <td><span style="color: #ef4444">${p.ghost}명</span></td>
            <td>${p.interview}명</td>
            <td><span style="color: #4f46e5; font-weight: 600;">${p.hired}명</span></td>
        </tr>
    `).join('');
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view-section');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            views.forEach(view => {
                view.classList.remove('active');
                if (view.id === target) view.classList.add('active');
            });
        });
    });
}

window.onload = initDashboard;
