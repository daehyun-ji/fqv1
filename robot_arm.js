'use strict';

// 글로벌 그래픽스 및 기구학 변수 정의
let scene, camera, renderer;
let robotGroup; // 로봇 바디 전체 탑노드
let joints = {}; // 실시간 트래킹용 관절 딕셔너리

let activeMotion = 'walk';
let simulationSpeed = 1.0;
let clock = new THREE.Clock();

// UI 통제용 DOM 선택자
const container = document.getElementById('canvas3dContainer');
const speedSlider = document.getElementById('speedSlider');
const speedVal = document.getElementById('speedVal');

init3DEngine();
buildHumanoidRobot();
bindUserInterface();
animateLoop();

// 1. 가상 3차원 물리 스페이스 및 카메라 렌더러 부팅
function init3DEngine() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040711);
    // 우주 기지 공간 느낌의 보라색 안개 배치
    scene.fog = new THREE.FogExp2(0x040711, 0.025);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    // 최초 구동 시 얼짱각도 스태틱 카메라 뷰 설정
    camera.position.set(0, 5, 12);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 공학 데이터 판독을 위한 계측선 격자(Grid) 및 바닥 레이저 시각화
    const gridHelper = new THREE.GridHelper(30, 30, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = -3;
    scene.add(gridHelper);

    // 입체 명암 가독성을 위한 인더스트리얼 듀얼 조명 시스템
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 0.8);
    dirLight1.position.set(10, 20, 10);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xa855f7, 0.5);
    dirLight2.position.set(-10, 5, -10);
    scene.add(dirLight2);

    // 간단하고 직관적인 궤도 회전 인터랙션 캡슐화 알고리즘 (Orbit Control 로직 직접 구현)
    let isDragging = false;
    let prevMouseX = 0, prevMouseY = 0;
    let camTheta = Math.PI / 2, camPhi = Math.PI / 2, camRadius = 12;

    container.addEventListener('mousedown', (e) => {
        isDragging = true;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let deltaX = e.clientX - prevMouseX;
        let deltaY = e.clientY - prevMouseY;

        camTheta -= deltaX * 0.005;
        camPhi -= deltaY * 0.005;
        camPhi = Math.max(0.1, Math.min(Math.PI - 0.1, camPhi)); // 뷰포트 뒤집힘 방지 가드

        prevMouseX = e.clientX;
        prevMouseY = e.clientY;

        // 구면좌표계를 카테시안 직교좌표계로 실시간 매핑 연산
        camera.position.x = camRadius * Math.sin(camPhi) * Math.sin(camTheta);
        camera.position.y = camRadius * Math.cos(camPhi) + 1; // 중심 높이 오프셋
        camera.position.z = camRadius * Math.sin(camPhi) * Math.cos(camTheta);
        camera.lookAt(0, 1, 0);
    });

    window.addEventListener('mouseup', () => isDragging = false);
    window.addEventListener('resize', onWindowResize);
}

// 2. 3D 기계 부품 메시 팩토리 및 구조적 다관절 로봇 조립
function buildHumanoidRobot() {
    robotGroup = new THREE.Group();
    scene.add(robotGroup);

    // 공학적 사이버 질감 메테리얼 로드
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.8 });
    const innerJointMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.4, emissive: 0x0284c7 });

    // 골반/몸체 베이스 (Torso Base)
    const torsoGeo = new THREE.CylinderGeometry(1.2, 0.8, 2.2, 6);
    const torso = new THREE.Mesh(torsoGeo, armorMat);
    torso.position.y = 1;
    robotGroup.add(torso);

    // 머리 파트 (Head Unit)
    const headGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const head = new THREE.Mesh(headGeo, armorMat);
    head.position.set(0, 1.6, 0);
    torso.add(head);

    // [서보모터 링크 결합 패키지 함수] 상하단 관절 트리 종속성 구조 빌드
    function createLimbs(name, sideX, startY) {
        const jointGroup = new THREE.Group();
        jointGroup.position.set(sideX, startY, 0);
        torso.add(jointGroup);

        const uLinkGeo = new THREE.CylinderGeometry(0.2, 0.15, 1.2, 8);
        uLinkGeo.translate(0, -0.6, 0); // 회전 중심축 하방 조정
        const upperLink = new THREE.Mesh(uLinkGeo, armorMat);
        jointGroup.add(upperLink);

        const subJoint = new THREE.Group();
        subJoint.position.set(0, -1.2, 0);
        upperLink.add(subJoint);

        const lLinkGeo = new THREE.CylinderGeometry(0.15, 0.1, 1.2, 8);
        lLinkGeo.translate(0, -0.6, 0);
        const lowerLink = new THREE.Mesh(lLinkGeo, armorMat);
        subJoint.add(lowerLink);

        // 정밀 제어 스크립트 연결을 위한 전역 인덱싱 가용화
        joints[name + '1'] = jointGroup;
        joints[name + '2'] = subJoint;
    }

    // 전신 4대 다관절 기구축 링크 배치 완료
    createLimbs('rArm', -1.5, 0.8);  // 오른팔
    createLimbs('lArm', 1.5, 0.8);   // 왼팔
    createLimbs('rLeg', -0.6, -1.2); // 오른다리
    createLimbs('lLeg', 0.6, -1.2);  // 왼다리
}

// 3. 실시간 다차원 위상 기하학 모션 제어 연산 루프
function animateLoop() {
    requestAnimationFrame(animateLoop);

    const time = clock.getElapsedTime() * simulationSpeed;

    // 모션 상태 머신 분기 처리 알고리즘 (삼각함수 위상 왜곡 제어)
    if (activeMotion === 'walk') {
        robotGroup.position.set(0, Math.sin(time * 4) * 0.1, 0); // 상하 출렁임 물리 적용
        
        // 역위상(180도) 스윙 제어 알고리즘
        joints.rArm1.rotation.x = Math.sin(time * 4) * 0.6;
        joints.rArm2.rotation.x = -Math.abs(Math.sin(time * 4)) * 0.4;
        joints.lArm1.rotation.x = -Math.sin(time * 4) * 0.6;
        joints.lArm2.rotation.x = -Math.abs(Math.cos(time * 4)) * 0.4;

        joints.rLeg1.rotation.x = -Math.sin(time * 4) * 0.5;
        joints.rLeg2.rotation.x = (Math.sin(time * 4) > 0 ? Math.sin(time * 4) * 0.8 : 0);
        joints.lLeg1.rotation.x = Math.sin(time * 4) * 0.5;
        joints.lLeg2.rotation.x = (Math.sin(time * 4) < 0 ? -Math.sin(time * 4) * 0.8 : 0);
    } 
    else if (activeMotion === 'run') {
        robotGroup.position.set(0, Math.abs(Math.sin(time * 6)) * 0.3 - 0.2, 0);
        
        joints.rArm1.rotation.x = Math.sin(time * 6) * 1.0;
        joints.rArm2.rotation.x = -0.5 - Math.abs(Math.sin(time * 6)) * 0.5;
        joints.lArm1.rotation.x = -Math.sin(time * 6) * 1.0;
        joints.lArm2.rotation.x = -0.5 - Math.abs(Math.cos(time * 6)) * 0.5;

        joints.rLeg1.rotation.x = -Math.sin(time * 6) * 0.9;
        joints.rLeg2.rotation.x = Math.max(0, Math.sin(time * 6) * 1.4);
        joints.lLeg1.rotation.x = Math.sin(time * 6) * 0.9;
        joints.lLeg2.rotation.x = Math.max(0, -Math.sin(time * 6) * 1.4);
    } 
    else if (activeMotion === 'back') {
        // 전진 스윙 위상을 반전시킨 역추진 알고리즘
        joints.rArm1.rotation.x = -Math.sin(time * 3) * 0.4;
        joints.lArm1.rotation.x = Math.sin(time * 3) * 0.4;
        joints.rLeg1.rotation.x = Math.sin(time * 3) * 0.4;
        joints.lLeg1.rotation.x = -Math.sin(time * 3) * 0.4;
        joints.rArm2.rotation.x = joints.lArm2.rotation.x = -0.2;
        joints.rLeg2.rotation.x = joints.lLeg2.rotation.x = 0.2;
    } 
    else if (activeMotion === 'wave') {
        // 한쪽 팔 상단 바인딩 오버라이딩 제어
        joints.rArm1.rotation.z = Math.PI / 1.5 + Math.sin(time * 8) * 0.4;
        joints.rArm2.rotation.x = -0.2;
        
        // 나머지 링크 대기 모드 정렬
        joints.lArm1.rotation.set(0,0,0); joints.lArm2.rotation.set(0,0,0);
        joints.rLeg1.rotation.set(0,0,0); joints.rLeg2.rotation.set(0,0,0);
        joints.lLeg1.rotation.set(0,0,0); joints.lLeg2.rotation.set(0,0,0);
    }

    // [핵심 매핑 데이터 연산] 3D 월드 매트릭스로부터 관절 고유 벡터 실시간 추출
    telemetryDataMapping();

    renderer.render(scene, camera);
}

// 4. 관절 글로벌 월드 벡터 좌표계 대시보드 변환 매핑
function telemetryDataMapping() {
    const targetJoints = {
        'j-rshoulder': joints.rArm1, 'j-relbow': joints.rArm2,
        'j-lshoulder': joints.lArm1, 'j-lelbow': joints.lArm2,
        'j-rhip': joints.rLeg1, 'j-rknee': joints.rLeg2,
        'j-lhip': joints.lLeg1, 'j-lknee': joints.lLeg2
    };

    const worldPos = new THREE.Vector3();
    
    for (const [id, jointObject] of Object.entries(targetJoints)) {
        if (!jointObject) continue;
        // 로컬 계층 행렬을 월드 직교 절대 좌표로 변환 연산
        jointObject.getWorldPosition(worldPos);
        const dom = document.getElementById(id);
        if (dom) {
            // 밀리미터 단위 스케일로 스케일업 보정 출력
            dom.innerText = `${(worldPos.x * 100).toFixed(0)}, ${(worldPos.y * 100).toFixed(0)}, ${(worldPos.z * 100).toFixed(0)}`;
        }
    }
}

// 5. 사용자 편의성(UX)을 극대화한 UI 인터페이스 제어 결합 모듈
function bindUserInterface() {
    // 가상 카메라 다이나믹 포커스 매트릭스 전환 이벤트 바인딩
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            const viewType = e.target.getAttribute('data-view');
            // 각 관절 조인트의 관심 영역(ROI) 뷰포트로 가상 카메라 시점 동적 워핑 연산
            if (viewType === 'full') camera.position.set(0, 5, 12);
            else if (viewType === 'r-arm') camera.position.set(-4, 6, 4);
            else if (viewType === 'l-arm') camera.position.set(4, 6, 4);
            else if (viewType === 'r-leg') camera.position.set(-2, 1, 5);
            else if (viewType === 'l-leg') camera.position.set(2, 1, 5);
            
            camera.lookAt(0, 0, 0);
        });
    });

    // 로봇 구동 상태 전환 머신 셋팅 인터페이스
    document.querySelectorAll('.motion-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.motion-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            activeMotion = e.target.getAttribute('data-motion');
        });
    });

    // 속도 변경 슬라이더 인풋 이벤트
    speedSlider.addEventListener('input', (e) => {
        simulationSpeed = parseFloat(e.target.value);
        speedVal.innerText = simulationSpeed.toFixed(1);
    });
}

function onWindowResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}
