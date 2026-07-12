'use strict';

// DOM 엘리먼트 참조
const canvas = document.getElementById('robotCanvas');
const ctx = canvas.getContext('2d');

// 로봇 물리적 매개변수 정의
const L1 = 160; 
const L2 = 140; 
const maxReach = L1 + L2; 
const minReach = Math.abs(L1 - L2); 

// 로봇 작동 원점
let baseX, baseY;

// 목표 좌표 초기화
let targetX = 120;
let targetY = 150;

// 관절 제어 각도
let theta1 = 0;
let theta2 = 0;
let isReachable = true;

// 해상도 버그 및 크기 조절 대응 함수
function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;

    const displayWidth = canvas.parentElement.clientWidth;
    const displayHeight = canvas.parentElement.clientHeight - 40;

    canvas.width = displayWidth * window.devicePixelRatio;
    canvas.height = displayHeight * window.devicePixelRatio;
    
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';

    ctx.resetTransform();
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    baseX = displayWidth / 2;
    baseY = displayHeight * 0.75;
    
    updateInverseKinematics();
}

// 역기하학 계산 수학 코어 모듈
function updateInverseKinematics() {
    const x = targetX - baseX;
    const y = baseY - targetY; 

    const r2 = x * x + y * y;
    const r = Math.sqrt(r2);

    const statusEl = document.getElementById('status');
    const targetXEl = document.getElementById('targetX');
    const targetYEl = document.getElementById('targetY');
    const angle1El = document.getElementById('angle1');
    const angle2El = document.getElementById('angle2');

    if (r > maxReach || r < minReach) {
        isReachable = false;
        if (statusEl) statusEl.innerHTML = '<span class="alert">범위 초과 (OUT OF RANGE)</span>';
        draw();
        return;
    }

    isReachable = true;
    if (statusEl) statusEl.innerHTML = '<span class="highlight">정상 작동 (STABLE)</span>';

    // 코사인 제2법칙 알고리즘 구현
    let cosTheta2 = (r2 - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    cosTheta2 = Math.max(-1, Math.min(1, cosTheta2)); 
    
    theta2 = Math.acos(cosTheta2);

    const alpha = Math.atan2(y, x);
    const beta = Math.atan2(L2 * Math.sin(theta2), L1 + L2 * Math.cos(theta2));
    theta1 = alpha - beta;

    if (targetXEl) targetXEl.innerText = x.toFixed(1);
    if (targetYEl) targetYEl.innerText = y.toFixed(1);
    if (angle1El) angle1El.innerText = (theta1 * 180 / Math.PI).toFixed(1) + '°';
    if (angle2El) angle2El.innerText = (theta2 * 180 / Math.PI).toFixed(1) + '°';

    draw();
}

// 캔버스 드로잉 모듈
function draw() {
    const W = canvas.width / window.devicePixelRatio;
    const H = canvas.height / window.devicePixelRatio;
    ctx.clearRect(0, 0, W, H);

    // 1. 모니터링 눈금자 그리드 드로잉
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const gridSize = 30;
    for(let x=0; x<W; x+=gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for(let y=0; y<H; y+=gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // 2. 최대 가동 반경 가이드 렌더링
    ctx.fillStyle = 'rgba(56, 189, 248, 0.03)';
    ctx.beginPath();
    ctx.arc(baseX, baseY, maxReach, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. 삼각비를 활용한 관절 노드 평면 위치 계산
    const j1x = baseX + L1 * Math.cos(theta1);
    const j1y = baseY - L1 * Math.sin(theta1);
    const j2x = j1x + L2 * Math.cos(theta1 + theta2);
    const j2y = j1y - L2 * Math.sin(theta1 + theta2);

    // 4. 로봇 바디 프레임 구조 드로잉
    ctx.lineCap = 'round';
    
    // 주 링크 1
    ctx.strokeStyle = isReachable ? '#f59e0b' : '#64748b';
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(j1x, j1y); ctx.stroke();

    // 부 링크 2
    ctx.strokeStyle = isReachable ? '#a855f7' : '#475569';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(j1x, j1y); ctx.lineTo(j2x, j2y); ctx.stroke();

    // 5. 관절 베어링 캡 베이스 연출
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(baseX, baseY, 8, 0, Math.PI*2); ctx.fill(); 
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(baseX, baseY, 4, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(j1x, j1y, 6, 0, Math.PI*2); ctx.fill(); 
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(j1x, j1y, 3, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = isReachable ? '#10b981' : '#f43f5e';
    ctx.beginPath(); ctx.arc(j2x, j2y, 5, 0, Math.PI*2); ctx.fill();

    // 6. 목표점 십자선 스코프 드로잉
    ctx.strokeStyle = isReachable ? '#10b981' : '#f43f5e';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(targetX, targetY, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(targetX - 12, targetY); ctx.lineTo(targetX + 12, targetY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(targetX, targetY - 12); ctx.lineTo(targetX, targetY + 12); ctx.stroke();
}

// 사용자 마우스 입력 이벤트 핸들러
function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    targetX = e.clientX - rect.left;
    targetY = e.clientY - rect.top;
    updateInverseKinematics();
}

// 안전한 이벤트 조립 프로세스
canvas.addEventListener('mousedown', (e) => {
    handleMouseMove(e);
    canvas.addEventListener('mousemove', handleMouseMove);
});

window.addEventListener('mouseup', () => {
    canvas.removeEventListener('mousemove', handleMouseMove);
});

window.addEventListener('resize', resizeCanvas);

// 서버 비동기 로딩 지연 대응 초기 구동 가드
document.addEventListener('DOMContentLoaded', resizeCanvas);
window.addEventListener('load', () => {
    setTimeout(resizeCanvas, 200);
});
