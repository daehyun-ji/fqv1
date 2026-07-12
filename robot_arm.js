'use strict';

let scene, camera, renderer;
let robotBaseNode; // 최상위 골반 링크 노드
let joints = {}; // 3D 물리 객체 인덱싱 스토리지
let jointMarkers = {}; // 문제 6: 관절별 색상 구체 인덱싱

let activeMotion = 'walk';
let simulationSpeed = 1.0;
let clock = new THREE.Clock();

// 오비탈 제어식 구면 좌표 매개변수
let camTheta = Math.PI / 3, camPhi = Math.PI / 2.3, camRadius = 10;
let cameraTarget = new THREE.Vector3(0, 0.4, 0);

const container = document.getElementById('canvas3dContainer');
const speedSlider = document.getElementById('speedSlider');
const speedVal = document.getElementById('speedVal');

// 초기 인프라 빌딩 가동
initSystemCore();
assembleHumanoidRobot();
bindInteractiveUI();
runHardwareLoop();

function initSystemCore() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02040a);
    scene.fog = new THREE.FogExp2(0x02040a, 0.035);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 500);
    applyCameraMatrix();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 하부 그리드선 설치
    const grid = new THREE.GridHelper(30, 30, 0x1e293b, 0x090f1e);
    grid.position.y = -2.5;
    scene.add(grid);

    // [문제 1 대응] 가시성 개선을 위한 고광량 입체 조명 레이아웃 배치
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    
    const frontLight = new THREE.DirectionalLight(0xffffff, 1.2);
    frontLight.position.set(4, 10, 15);
    scene.add(frontLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rimLight.position.set(-8, 5, -8);
    scene.add(rimLight);

    const blueFillLight = new THREE.DirectionalLight(0xa855f7, 0.6);
    blueFillLight.position.set(0, -5, 5);
    scene.add(blueFillLight);

    // 마우스 드래그 조작 알고리즘 내부 캡슐화
    let dragging = false;
    let lastX = 0, lastY = 0;

    container.addEventListener('mousedown', (e) => {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        let dx = e.clientX - lastX;
        let dy = e.clientY - lastY;

        camTheta -= dx * 0.006;
        camPhi -= dy * 0.006;
        camPhi = Math.max(0.05, Math.min(Math.PI - 0.05, camPhi));

        lastX = e.clientX; lastY = e.clientY;
        applyCameraMatrix();
    });

    window.addEventListener('mouseup', () => dragging = false);
    window.addEventListener('resize', handleWindowResize);
}

function applyCameraMatrix() {
    camera.position.x = camRadius * Math.sin(camPhi) * Math.sin(camTheta) + cameraTarget.x;
    camera.position.y = camRadius * Math.cos(camPhi) + cameraTarget.y;
    camera.position.z = camRadius * Math.sin(camPhi) * Math.cos(camTheta) + cameraTarget.z;
    camera.lookAt(cameraTarget);
}

function assembleHumanoidRobot() {
    // 최상위 루트 노드 (골반 위치에 매핑)
    robotBaseNode = new THREE.Group();
    robotBaseNode.position.y = -0.2; 
    scene.add(robotBaseNode);

    // [문제 1 대응] 고가시성 하이테크 크롬-실버 하이라이팅 재질 정의
    const armorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x94a3b8, roughness: 0.1, metalness: 0.9, emissive: 0x111827 
    });

    // 문제 6 대응: 오른쪽 UI 컬러셋과 일치하는 고휘도 발광 관절 마커 재질 정의
    const colorMap = {
        orange: new THREE.MeshStandardMaterial({ color: 0xfb923c, emissive: 0xfb923c, roughness: 0.2 }),
        purple: new THREE.MeshStandardMaterial({ color: 0xc084fc, emissive: 0xc084fc, roughness: 0.2 }),
        green:  new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, roughness: 0.2 }),
        blue:   new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x60a5fa, roughness: 0.2 })
    };

    // [문제 3 대응] 몸통 스케일 슬림화 팩토링
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 1.6, 8), armorMaterial);
    torso.position.y = 0.8;
    robotBaseNode.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), armorMaterial);
    head.position.set(0, 1.1, 0);
    torso.add(head);

    // [문제 2 대응] 완벽한 계층 구조 트리 조립 함수 빌더
    function buildLimbStructure(name, isArm, offsetX, offsetY, jointColor) {
        // 1단계: 상위 관절 구동기 그룹 (어깨 / 고관절)
        const upperJointGroup = new THREE.Group();
        upperJointGroup.position.set(offsetX, offsetY, 0);
        torso.add(upperJointGroup);

        // [문제 6 대응] 관절 중심에 정밀 컬러 구체 박아넣기
        const uMarker = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), colorMap[jointColor]);
        upperJointGroup.add(uMarker);

        // 상단 기계 링크 바디
        const upperBoneLength = isArm ? 0.7 : 0.8;
        const upperBoneGeo = new THREE.CylinderGeometry(0.12, 0.09, upperBoneLength, 8);
        upperBoneGeo.translate(0, -upperBoneLength / 2, 0); // 피벗축을 결합 원점으로 평행이동
        const upperBoneMesh = new THREE.Mesh(upperBoneGeo, armorMaterial);
        upperJointGroup.add(upperBoneMesh);

        // 2단계: 하위 관절 구동기 그룹 (팔꿈치 / 무릎) - 상단 링크 끝단에 완전 종속 조립
        const lowerJointGroup = new THREE.Group();
        lowerJointGroup.position.set(0, -upperBoneLength, 0);
        upperJointGroup.add(lowerJointGroup); // 트리 종속 바인딩 완료

        const lMarker = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), colorMap[jointColor]);
        lowerJointGroup.add(lMarker);

        // 하단 기계 링크 바디
        const lowerBoneLength = isArm ? 0.6 : 0.8;
        const lowerBoneGeo = new THREE.CylinderGeometry(0.09, 0.06, lowerBoneLength, 8);
        lowerBoneGeo.translate(0, -lowerBoneLength / 2, 0);
        const lowerBoneMesh = new THREE.Mesh(lowerBoneGeo, armorMaterial);
        lowerJointGroup.add(lowerBoneMesh);

        // 인덱서 바인딩
        joints[name + '1'] = upperJointGroup;
        joints[name + '2'] = lowerJointGroup;
    }

    // 전신 4대 기구학 패키지 구조 결합 (위치 및 칼라셋 1:1 디렉팅)
    buildLimbStructure('rArm', true,  -0.65,  0.6,  'orange');
    buildLimbStructure('lArm', true,   0.65,  0.6,  'purple');
    buildLimbStructure('rLeg', false, -0.3,  -0.8,  'green');
    buildLimbStructure('lLeg', false,  0.3,  -0.8,  'blue');
}

function runHardwareLoop() {
    requestAnimationFrame(runHardwareLoop);

    const time = clock.getElapsedTime() * simulationSpeed;

    // [문제 5 대응] 모션 가변 시 타 관절 각도 간섭 버그 차단을 위한 기본 각도 초기화 매트릭스 리셋 가드
    for (const key in joints) {
        joints[key].rotation.set(0, 0, 0);
    }
    robotBaseNode.position.set(0, -0.2, 0);
    robotBaseNode.rotation.set(0, 0, 0);

    // 7단 멀티 모션 상태 제어 분기 알고리즘
    if (activeMotion === 'walk') {
        robotBaseNode.position.y = -0.2 + Math.sin(time * 4) * 0.06;
        
        joints.rArm1.rotation.x = Math.sin(time * 4) * 0.4;
        joints.rArm2.rotation.x = -Math.abs(Math.sin(time * 4)) * 0.25;
        joints.lArm1.rotation.x = -Math.sin(time * 4) * 0.4;
        joints.lArm2.rotation.x = -Math.abs(Math.cos(time * 4)) * 0.25;

        joints.rLeg1.rotation.x = -Math.sin(time * 4) * 0.35;
        joints.rLeg2.rotation.x = Math.max(0, Math.sin(time * 4) * 0.5);
        joints.lLeg1.rotation.x = Math.sin(time * 4) * 0.35;
        joints.lLeg2.rotation.x = Math.max(0, -Math.sin(time * 4) * 0.5);
    } 
    // [문제 8 대응] 걷기 대비 2.5배 이상의 고진폭 위상각을 준 역동적 러닝 모션
    else if (activeMotion === 'run') {
        robotBaseNode.position.y = -0.1 + Math.abs(Math.sin(time * 6.5)) * 0.35;
        robotBaseNode.rotation.x = 0.15; // 몸체를 앞으로 약간 숙인 역동성 연출
        
        joints.rArm1.rotation.x = Math.sin(time * 6.5) * 1.1; 
        joints.rArm2.rotation.x = -0.6 - Math.abs(Math.sin(time * 6.5)) * 0.6;
        joints.lArm1.rotation.x = -Math.sin(time * 6.5) * 1.1;
        joints.lArm2.rotation.x = -0.6 - Math.abs(Math.cos(time * 6.5)) * 0.6;

        joints.rLeg1.rotation.x = -Math.sin(time * 6.5) * 0.9;
        joints.rLeg2.rotation.x = Math.max(0, Math.sin(time * 6.5) * 1.3);
        joints.lLeg1.rotation.x = Math.sin(time * 6.5) * 0.9;
        joints.lLeg2.rotation.x = Math.max(0, -Math.sin(time * 6.5) * 1.3);
    } 
    else if (activeMotion === 'back') {
        robotBaseNode.position.y = -0.2 + Math.sin(time * 3.5) * 0.04;
        joints.rArm1.rotation.x = -Math.sin(time * 3.5) * 0.3;
        joints.lArm1.rotation.x = Math.sin(time * 3.5) * 0.3;
        joints.rLeg1.rotation.x = Math.sin(time * 3.5) * 0.3;
        joints.lLeg1.rotation.x = -Math.sin(time * 3.5) * 0.3;
        joints.rArm2.rotation.x = joints.lArm2.rotation.x = -0.15;
        joints.rLeg2.rotation.x = joints.lLeg2.rotation.x = 0.15;
    } 
    // [문제 4 대응] 양팔 360도 연속 고속 회전 (Windmill) 알고리즘 구현
    else if (activeMotion === 'wave') {
        joints.rArm1.rotation.x = time * 7; 
        joints.lArm1.rotation.x = -time * 7; // 왼팔은 역방향 회전 교차 기믹
        joints.rArm2.rotation.x = joints.lArm2.rotation.x = -0.1;
    } 
// [완벽 교정] 수직 스쿼트 후 양팔이 바깥쪽으로 대칭되며 고공 도약하는 점프 알고리즘
    else if (activeMotion === 'jump') {
        let cycle = (time * 2.5) % (Math.PI * 2);
        if (cycle < Math.PI) {
            // 1단계: 공중 도약 상태 (양팔이 몸 안으로 안 들어가고, 로봇 기준 바깥쪽 대칭으로 시원하게 들려 올라감)
            robotBaseNode.position.y = -0.2 + Math.sin(cycle) * 1.6;
            
            // rArm1(오른팔)은 -Z 방향(오른쪽 바깥), lArm1(왼팔)은 +Z 방향(왼쪽 바깥)으로 대칭 회전 유도
            joints.rArm1.rotation.z = -Math.sin(cycle) * 1.0; 
            joints.lArm1.rotation.z = Math.sin(cycle) * 1.0;
            
            // 자연스러운 도약 균형을 위해 앞으로도 살짝 들어 올림 (X축 회전)
            joints.rArm1.rotation.x = -Math.sin(cycle) * 0.4;
            joints.lArm1.rotation.x = -Math.sin(cycle) * 0.4;

            // 다리는 가볍게 굽혀 공중 자세 연출
            joints.rLeg1.rotation.x = joints.lLeg1.rotation.x = -0.2;
            joints.rLeg2.rotation.x = joints.lLeg2.rotation.x = 0.4;
        } else {
            // 2단계: 지면 착지 및 쿠션 충격 흡수 감쇠 상태
            let s = Math.sin(cycle);
            robotBaseNode.position.y = -0.2 + s * 0.2;
            
            // 착지 시에는 다시 양팔을 내리며 중심을 잡음
            joints.rArm1.rotation.set(0, 0, 0);
            joints.lArm1.rotation.set(0, 0, 0);
            
            joints.rLeg1.rotation.x = joints.lLeg1.rotation.x = -s * 0.6;
            joints.rLeg2.rotation.x = joints.lLeg2.rotation.x = -s * 1.1;
        }
    }
    // [문제 7 신규 모션 2] 후방 아크로바틱 360도 공중 제비 덤블링
    else if (activeMotion === 'flip') {
        let jumpCycle = time * 3;
        robotBaseNode.position.y = -0.2 + Math.abs(Math.sin(jumpCycle)) * 1.8;
        robotBaseNode.rotation.x = -jumpCycle * 2; // 본체 자체를 X축 기준으로 고속 피치 전천후 회전
        
        joints.rArm1.rotation.x = joints.lArm1.rotation.x = Math.PI;
        joints.rLeg2.rotation.x = joints.lLeg2.rotation.x = 0.6;
    } 
    // [문제 7 신규 모션 3] 하체 고정 및 무술 방어 가드 스탠스
    else if (activeMotion === 'defense') {
        robotBaseNode.position.y = -0.4; // 중심을 낮춤
        joints.rLeg1.rotation.x = -0.4; joints.rLeg2.rotation.x = 0.8;
        joints.lLeg1.rotation.x = -0.4; joints.lLeg2.rotation.x = 0.8;
        
        // 양손을 얼굴 앞으로 모아 전방 크로스 가드 태세
        joints.rArm1.rotation.x = 0.8; joints.rArm1.rotation.y = 0.5; joints.rArm2.rotation.x = -1.2;
        joints.lArm1.rotation.x = 0.8; joints.lArm1.rotation.y = -0.5; joints.lArm2.rotation.x = -1.2;
    }

    updateTelemetryMatrix();
    renderer.render(scene, camera);
}

function updateTelemetryMatrix() {
    const trackingMap = {
        'j-rshoulder': joints.rArm1, 'j-relbow': joints.rArm2,
        'j-lshoulder': joints.lArm1, 'j-lelbow': joints.lArm2,
        'j-rhip': joints.rLeg1, 'j-rknee': joints.rLeg2,
        'j-lhip': joints.lLeg1, 'j-lknee': joints.lLeg2
    };

    const vec3 = new THREE.Vector3();
    
    for (const [domId, jointObj] of Object.entries(trackingMap)) {
        if (!jointObj) continue;
        // 로컬 행렬을 글로벌 스페이스 좌표계로 파싱 연산
        jointObj.getWorldPosition(vec3);
        const dom = document.getElementById(domId);
        if (dom) {
            // 밀리미터 단위 스케일 매핑 및 출력
            dom.innerText = `${(vec3.x * 100).toFixed(0)}, ${(vec3.y * 100).toFixed(0)}, ${(vec3.z * 100).toFixed(0)}`;
        }
    }
}

function bindInteractiveUI() {
    // 뷰포트 시점 쿼터니언 변환 이벤트 바인딩
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            const view = e.target.getAttribute('data-view');
            
            if (view === 'full') { cameraTarget.set(0,0.4,0); camRadius = 10; camTheta = Math.PI/3; camPhi = Math.PI/2.3; }
            else if (view === 'r-arm') { cameraTarget.set(-0.65, 1.4, 0); camRadius = 3.2; camTheta = -Math.PI/4; camPhi = Math.PI/2.5; }
            else if (view === 'l-arm') { cameraTarget.set(0.65, 1.4, 0); camRadius = 3.2; camTheta = Math.PI/4; camPhi = Math.PI/2.5; }
            else if (view === 'r-leg') { cameraTarget.set(-0.3, -0.2, 0); camRadius = 3.5; camTheta = -Math.PI/5; camPhi = Math.PI/2.1; }
            else if (view === 'l-leg') { cameraTarget.set(0.3, -0.2, 0); camRadius = 3.5; camTheta = Math.PI/5; camPhi = Math.PI/2.1; }
            
            applyCameraMatrix();
        });
    });

    // 모션 엔진 변환 맵 인터페이스 바인딩
    document.querySelectorAll('.motion-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.motion-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            activeMotion = e.target.getAttribute('data-motion');
        });
    });

    speedSlider.addEventListener('input', (e) => {
        simulationSpeed = parseFloat(e.target.value);
        speedVal.innerText = simulationSpeed.toFixed(1);
    });
}

function handleWindowResize() {
    if (!container.clientWidth || !container.clientHeight) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    applyCameraMatrix();
}

// 윈도우 인스턴스 초기화 바인딩 가드
document.addEventListener('DOMContentLoaded', () => { setTimeout(handleWindowResize, 150); });
window.addEventListener('load', () => { setTimeout(handleWindowResize, 350); });
