'use strict';

// DOM 캐싱 및 글로벌 환경 변수 정의
const canvas = document.getElementById('robotCanvas');
const ctx = canvas.getContext('2d');

// 로봇 하드웨어 매개변수 (기계공학 링크 파라미터)
const L1 = 160; 
const L2 = 140; 
const maxReach = L1 + L2; 
const minReach = Math.abs(L1 - L2); 

// 로봇 팔의 고정 지점(원점) 좌표
let baseX, baseY;

// 마우스 인풋 기반의 초기 목표 좌표 (End-Effector Target)
let targetX = 120;
let targetY = 150;

// 연산된 링크들의 관절 회전 기하각 변수
let theta1 = 0;
let theta2 = 0;
let isReachable = true;

// 캔버스 크기 동적 변화 대응 함수
function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = canvas.parentElement.clientWidth * window.devicePixelRatio;
    canvas.height = (rect.height - 40) * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    // 로봇의 물리 원점을 캔버스 기준 하단 중앙으로 맵핑
    baseX = (canvas.width / window.devicePixelRatio) / 2;
    baseY = ((canvas.height / window.devicePixelRatio) * 0.75);
    
    updateInverseKinematics();
}

// [핵심 연산 모듈] 수치해석 기반의 역기하학 알고리즘
function updateInverseKinematics() {
    // 디스플레이 픽셀 좌표계를 삼각함수 물리 좌표계(원점 기준 상대 좌표)로 변환
    const x = targetX - baseX;
    const y = baseY - targetY; // 그래픽스 상 하향 Y축 흐름 반전 보정

    const r2 = x * x + y * y;
    const r = Math.sqrt(r2);

    // 가동 한계(Workspace Boundary) 도달 조건 판별식 예외 처리
    if (r > maxReach || r < minReach) {
        isReachable = false;
        document.getElementById('status').innerHTML = '<span class="alert">범위 초과 (OUT OF RANGE)</span>';
        draw();
        return;
    }

    isReachable = true;
    document.getElementById('status').innerHTML = '<span class="highlight">정상 작동 (STABLE)</span>';

    // 코사인 제2법칙 알고리즘에 따른 θ₂ 산출 공식 적용
    let cosTheta2 = (r2 - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    cosTheta2 = Math.max(-1, Math.min(1, cosTheta2)); // 도메인 바운더리 오차 가드
    
    // 기하학적 Elbow-up 기구 배치 채택
    theta2 = Math.acos(cosTheta2);

    // 기하학적 상대 삼각비 관계 분석을 통한 θ₁ 결정 연산
    const alpha = Math.atan2(y, x);
    const beta = Math.atan2(L2 * Math.sin(theta2), L1 + L2 * Math.cos(theta2));
    theta1 = alpha - beta;

    // 사이드바 인터페이스에 데이터 동적 동기화
    document.getElementById('targetX').innerText = x.toFixed(1);
    document.getElementById('targetY').innerText = y.toFixed(1);
    document.getElementById('angle1').innerText = (theta1 * 180 / Math.PI).toFixed(1) + '°';
    document.getElementById('angle2').innerText = (theta2 * 180 / Math.PI).toFixed(1) + '°';

    draw();
}

// 그래픽스 렌더링 함수
function draw() {
    const W = canvas.width / window.devicePixelRatio;
    const H = canvas.height / window.devicePixelRatio;
    ctx.clearRect(0, 0, W, H);

    // 1. 배경 눈금 격자선(Grid) 인포그래픽 시각화
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const gridSize = 30;
    for(let x=0; x<W; x+=gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for(let y=0; y<H; y+=gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // 2. 가수가능 최대 작업 공간(Workspace Circle) 시각화
    ctx.fillStyle = 'rgba(56, 189, 248, 0.03)';
    ctx.beginPath();
    ctx.arc(baseX, baseY, maxReach, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. 관절 링크의 2차원 기하학적 노드 좌표 도출
    const j1x = baseX + L1 * Math.cos(theta1);
    const j1y = baseY - L1 * Math.sin(theta1);
    const j2x = j1x + L2 * Math.cos(theta1 + theta2);
    const j2y = j1y - L2 * Math.sin(theta1 + theta2);

    // 4. 로봇 기구 바디 링크 렌더링
    // 주 동력 링크 1 (어깨 어셈블리 -> 팔꿈치)
    ctx.strokeStyle = isReachable ? '#f59e0b' : '#64748b';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(j1x, j1y);
    ctx.stroke();

    // 종동 링크 2 (팔꿈치 조인트 -> 에펜디 엔드 이펙터)
    ctx.strokeStyle = isReachable ? '#a855f7' : '#475569';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(j1x, j1y);
    ctx.lineTo(j2x, j2y);
    ctx.stroke();

    // 5. 조인트 액추에이터 고정 핀 데코레이션
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

    // 6. 사용자의 인풋 타깃 조준점 인디케이터 드로잉
    ctx.strokeStyle = isReachable ? '#10b981' : '#f43f5e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(targetX - 12, targetY); ctx.lineTo(targetX + 12, targetY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(targetX, targetY - 12); ctx.lineTo(targetX, targetY + 12); stroke();
    ctx.beginPath(); ctx.moveTo(targetX, targetY - 12); ctx.lineTo(targetX, targetY + 12); ctx.stroke();
}

// 마우스 움직임 캡처 핸들러 함수
function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    targetX = e.clientX - rect.left;
    targetY = e.clientY - rect.top;
    updateInverseKinematics();
}

// [디버깅 핵심] 마우스 이벤트 인터페이스 바인딩
canvas.addEventListener('mousedown', (e) => {
    handleMouseMove(e);
    canvas.addEventListener('mousemove', handleMouseMove);
});

window.addEventListener('mouseup', () => {
    canvas.removeEventListener('mousemove', handleMouseMove);
});

// 화면 크기가 바뀔 때마다 3D/2D 픽셀 좌표를 재계산
window.addEventListener('resize', resizeCanvas);

// 깃허브 페이지 렌더링 타이밍 버그 방지 가드코드
// HTML 문서 구조가 완전히 로드된 후(DOMContentLoaded) 1차 실행, 
// CSS와 외부 스타일까지 완전히 반영된 후(load) 2차 실행하여 화면이 텅 비는 오류를 완벽히 차단합니다.
document.addEventListener('DOMContentLoaded', resizeCanvas);
window.addEventListener('load', () => {
    setTimeout(resizeCanvas, 300); // 0.3초 여유를 두어 안정적 부팅 완료
});

// 시스템 최초 리사이징 및 정적 로드 안정화
setTimeout(resizeCanvas, 100);
