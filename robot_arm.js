'use strict';

let scene, camera, renderer;
let robotGroup; 
let joints = {}; 

let activeMotion = 'walk';
let simulationSpeed = 1.0;
let clock = new THREE.Clock();

// 카메라 구면좌표계 드래그 알고리즘 전역 상태 매개변수
let camTheta = Math.PI / 3, camPhi = Math.PI / 2.5, camRadius = 11;
let targetLookAt = new THREE.Vector3(0, 0, 0);

const container = document.getElementById('canvas3dContainer');
const speedSlider = document.getElementById('speedSlider');
const speedVal = document.getElementById('speedVal');

// 시스템 이니셜라이징 부팅 단계
init3DCore();
buildHumanoidSkeleton();
bindUIEvents();
executeRenderLoop();

function init3DCore() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040711);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 500);
    updateCameraPosition();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 하단 데이터 검측 레이아웃 그리드선 설치
    const grid = new THREE.GridHelper(24, 24, 0x38bdf8, 0x1e293b);
    grid.position.y = -2.5;
    scene.add(grid);

    // 관제실 하이테크 인더스트리얼 광원 밸런싱
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    
    const light1 = new THREE.DirectionalLight(0x38bdf8, 0.7);
    light1.position.set(5, 15, 5);
    scene.add(light1);

    const light2 = new THREE.DirectionalLight(0xa855f7, 0.4);
    light2.position.set(-5, 5, -5);
    scene.add(light2);

    // [완벽한 독립 구현] OrbitControls 라이브러리 없이 네이티브 드래그 시점 엔진 구동
    let isDragging = false;
    let prevX = 0, prevY = 0;

    container.addEventListener('mousedown', (e) => {
        isDragging = true;
        prevX = e.clientX;
        prevY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let dX = e.clientX - prevX;
        let dY = e.clientY - prevY;

        camTheta -= dX * 0.007;
        camPhi -= dY * 0.007;
        camPhi = Math.max(0.1, Math.min(Math.PI - 0.1, camPhi));

        prevX = e.clientX;
        prevY = e.clientY;
        updateCameraPosition();
    });

    window.addEventListener('mouseup', () => isDragging = false);
    window.addEventListener('resize', handleResize);
}

function updateCameraPosition() {
    camera.position.x = camRadius * Math.sin(camPhi) * Math.sin(camTheta) + targetLookAt.x;
    camera.position.y = camRadius * Math.cos(camPhi) + targetLookAt.y;
    camera.position.z = camRadius * Math.sin(camPhi) * Math.cos(camTheta) + targetLookAt.z;
    camera.lookAt(targetLookAt);
}

function buildHumanoidSkeleton() {
    robotGroup = new THREE.Group();
    scene.add(robotGroup);

    const armorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.7 });

    // 몸체 뼈대 빌드 (Torso Frame)
    const torsoGeo = new THREE.CylinderGeometry(1.0, 0.7, 2.0, 6);
    const torso = new THREE.Mesh(torsoGeo, armorMat);
    torso.position.y = 0.8;
    robotGroup.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), armorMat);
    head.position.set(0, 1.4, 0);
    torso.add(head);

    // 사지 링크 어셈블리 재귀 구조화 빌더 함수
    function attachLimb(name, ox, oy) {
        const rootJoint = new THREE.Group();
        rootJoint.position.set(ox, oy, 0);
        torso.add(rootJoint);

        const uLink = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 1.0, 8), armorMat);
        uLink.geometry.translate(0, -0.5, 0);
        rootJoint.add(uLink);

        const midJoint = new THREE.Group();
        midJoint.position.set(0, -1.0, 0);
        uLink.add(midJoint);

        const lLink = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 1.0, 8), armorMat);
        lLink.geometry.translate(0, -0.5, 0);
        midJoint.add(lLink);

        joints[name + '1'] = rootJoint;
        joints[name + '2'] = midJoint;
    }

    // 전신 다관절 서보 토폴로지 구축
    attachLimb('rArm', -1.3, 0.7);
    attachLimb('lArm', 1.3, 0.7);
    attachLimb('rLeg', -0.5, -1.0);
    attachLimb('lLeg', 0.5, -1.0);
}

function executeRenderLoop() {
    requestAnimationFrame(executeRenderLoop);

    const delta = clock.getElapsedTime() * simulationSpeed;

    // 기하 삼각함수 위상 오실레이션 제어 (State Machine)
    if (activeMotion === 'walk') {
        robotGroup.position.y = Math.sin(delta * 4) * 0.08;
        
        joints.rArm1.rotation.x = Math.sin(delta * 4) * 0.5;
        joints.rArm2.rotation.x = -Math.abs(Math.sin(delta * 4)) * 0.3;
        joints.lArm1.rotation.x = -Math.sin(delta * 4) * 0.5;
        joints.lArm2.rotation.x = -Math.abs(Math.cos(delta * 4)) * 0.3;

        joints.rLeg1.rotation.x = -Math.sin(delta * 4) * 0.4;
        joints.rLeg2.rotation.x = Math.max(0, Math.sin(delta * 4) * 0.6);
        joints.lLeg1.rotation.x = Math.sin(delta * 4) * 0.4;
        joints.lLeg2.rotation.x = Math.max(0, -Math.sin(delta * 4) * 0.6);
    } 
    else if (activeMotion === 'run') {
        robotGroup.position.y = Math.abs(Math.sin(delta * 6)) * 0.25 - 0.1;
        
        joints.rArm1.rotation.x = Math.sin(delta * 6) * 0.9;
        joints.rArm2.rotation.x = -0.4 - Math.abs(Math.sin(delta * 6)) * 0.4;
        joints.lArm1.rotation.x = -Math.sin(delta * 6) * 0.9;
        joints.lArm2.rotation.x = -0.4 - Math.abs(Math.cos(delta * 6)) * 0.4;

        joints.rLeg1.rotation.x = -Math.sin(delta * 6) * 0.8;
        joints.rLeg2.rotation.x = Math.max(0, Math.sin(delta * 6) * 1.2);
        joints.lLeg1.rotation.x = Math.sin(delta * 6) * 0.8;
        joints.lLeg2.rotation.x = Math.max(0, -Math.sin(delta * 6) * 1.2);
    } 
    else if (activeMotion === 'back') {
        joints.rArm1.rotation.x = -Math.sin(delta * 3) * 0.3;
        joints.lArm1.rotation.x = Math.sin(delta * 3) * 0.3;
        joints.rLeg1.rotation.x = Math.sin(delta * 3) * 0.3;
        joints.lLeg1.rotation.x = -Math.sin(delta * 3) * 0.3;
        joints.rArm2.rotation.x = joints.lArm2.rotation.x = -0.1;
        joints.rLeg2.rotation.x = joints.lLeg2.rotation.x = 0.1;
    } 
    else if (activeMotion === 'wave') {
        joints.rArm1.rotation.z = Math.PI / 1.6 + Math.sin(delta * 8) * 0.3;
        joints.rArm2.rotation.x = -0.1;
        
        joints.lArm1.rotation.set(0,0,0); joints.lArm2.rotation.set(0,0,0);
        joints.rLeg1.rotation.set(0,0,0); joints.rLeg2.rotation.set(0,0,0);
        joints.lLeg1.rotation.set(0,0,0); joints.lLeg2.rotation.set(0,0,0);
    }

    processTelemetryTracking();
    renderer.render(scene, camera);
}

function processTelemetryTracking() {
    const targetMap = {
        'j-rshoulder': joints.rArm1, 'j-relbow': joints.rArm2,
        'j-lshoulder': joints.lArm1, 'j-lelbow': joints.lArm2,
        'j-rhip': joints.rLeg1, 'j-rknee': joints.rLeg2,
        'j-lhip': joints.lLeg1, 'j-lknee': joints.lLeg2
    };

    const vec = new THREE.Vector3();
    
    for (const [domId, jointObj] of Object.entries(targetMap)) {
        if (!jointObj) continue;
        jointObj.getWorldPosition(vec);
        const element = document.getElementById(domId);
        if (element) {
            // 정밀 mm 스케일 공간 매핑 출력
            element.innerText = `${(vec.x * 100).toFixed(0)}, ${(vec.y * 100).toFixed(0)}, ${(vec.z * 100).toFixed(0)}`;
        }
    }
}

function bindUIEvents() {
    // 다이나믹 카메라 포커스 이동 알고리즘 바인딩
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            const view = e.target.getAttribute('data-view');
            
            // 시점 필터별 카메라 타깃 벡터 공간 제어
            if (view === 'full') { targetLookAt.set(0,0,0); camRadius = 11; camTheta = Math.PI/3; camPhi = Math.PI/2.5; }
            else if (view === 'r-arm') { targetLookAt.set(-1.3, 0.7, 0); camRadius = 4; camTheta = -Math.PI/4; camPhi = Math.PI/3; }
            else if (view === 'l-arm') { targetLookAt.set(1.3, 0.7, 0); camRadius = 4; camTheta = Math.PI/4; camPhi = Math.PI/3; }
            else if (view === 'r-leg') { targetLookAt.set(-0.5, -1.0, 0); camRadius = 4; camTheta = -Math.PI/6; camPhi = Math.PI/2; }
            else if (view === 'l-leg') { targetLookAt.set(0.5, -1.0, 0); camRadius = 4; camTheta = Math.PI/6; camPhi = Math.PI/2; }
            
            updateCameraPosition();
        });
    });

    // 모션 상태 설정 바인딩
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

function handleResize() {
    if (!container.clientWidth || !container.clientHeight) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    updateCameraPosition();
}

// 초기 부팅 안정화 트릭
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(handleResize, 150);
});
window.addEventListener('load', () => {
    setTimeout(handleResize, 300);
});
