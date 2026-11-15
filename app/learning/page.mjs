"use client";
import React from 'react';import AcademyFrame from '../../components/academy-frame.mjs';import LearningApp from '../../components/learning-app.mjs';
export default function Page(){return React.createElement(AcademyFrame,{current:'/learning'},React.createElement(LearningApp))}
